import { ok, fail } from "@/lib/api/response";
import type { CanonicalOperationResultV1 } from "./types";

export type LegacyExecutionShape = {
  actionName: string;
  executionId: string;
  status: "SUCCESS" | "FAILURE";
  outcome: "SUCCEEDED" | "NO_CHANGE" | "REPLAYED" | "FAILED";
  correlationId: string;
  operationId: string;
  metadata?: Record<string, unknown>;
};

/**
 * Reconstructs the pre-existing `CustomerActionExecutionResult`-shaped
 * object every action route already returned as `{ execution }` — so
 * clients written against that shape (customers-client.ts and its sibling
 * quote/invoice/task/payment clients, and the ConversationExtensions that
 * only check `response.ok` and `execution.status === "SUCCESS"`) keep
 * working unchanged while the route's *authority* moves to
 * CanonicalOperationResultV1.
 */
export function toLegacyExecutionShape(result: CanonicalOperationResultV1, nativeActionName: string): LegacyExecutionShape {
  return {
    actionName: nativeActionName,
    executionId: result.nativeExecutionId ?? result.operationId,
    status: "SUCCESS",
    outcome: result.mutationPerformed ? "SUCCEEDED" : "NO_CHANGE",
    correlationId: result.correlationId,
    operationId: result.nativeOperationId ?? result.operationId,
    metadata: (result.data as Record<string, unknown> | undefined) ?? {},
  };
}

/**
 * Single canonical HTTP mapping for every route that executes a
 * CanonicalOperationV1 write — this is the one place a CanonicalOperation
 * failure status becomes an HTTP response, so no route re-derives its own
 * success/failure judgment from a re-interpreted shape.
 */
export function canonicalOperationResultToHttpResponse(result: CanonicalOperationResultV1, nativeActionName: string): Response {
  if (result.status === "EXECUTED" || result.status === "READ_COMPLETED") {
    return ok({ execution: toLegacyExecutionShape(result, nativeActionName) }, 200);
  }
  if (result.status === "APPROVAL_REQUIRED") {
    return fail(result.failureMessage ?? "Bu islem onay gerektiriyor.", 409);
  }
  if (result.status === "CONFLICT") {
    return fail(result.failureMessage ?? "Bu islem su haliyle calistirilamaz.", 409);
  }
  if (result.status === "CLARIFICATION_REQUIRED") {
    return fail(result.failureMessage ?? "Bu islem icin ek bilgi gerekiyor.", 400);
  }
  if (result.status === "UNSUPPORTED") {
    return fail(result.failureMessage ?? "Desteklenmeyen islem.", 400);
  }
  // FAILED
  if (result.failureClassification === "AUTHORIZATION_DENIED") {
    return fail(result.failureMessage ?? "Bu islemi gerceklestirme yetkiniz yok.", 403);
  }
  if (result.failureClassification === "VALIDATION_FAILED") {
    return fail(result.failureMessage ?? "Gecersiz istek.", 400);
  }
  return fail(result.failureMessage ?? "Bu islemi gerceklestiremedim. Tekrar dener misiniz?", 500);
}
