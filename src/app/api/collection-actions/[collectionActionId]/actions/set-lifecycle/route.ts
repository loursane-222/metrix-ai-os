import { randomUUID } from "crypto";
import { ok } from "@/lib/api/response";
import { readJsonObject, requiredIdempotencyKey, requiredString, requiredStringEnum } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import {
  cancelCollectionLifecycleApproval,
  executeApprovedCollectionLifecycle,
  requestCollectionLifecycleApproval,
  type CollectionLifecycleStatus,
} from "@/lib/action-runtime/gateway/collection-lifecycle-gateway";

const LIFECYCLE_STATUSES: readonly CollectionLifecycleStatus[] = ["IN_PROGRESS", "DONE", "DISMISSED"];

export async function POST(request: Request, context: { params: Promise<{ collectionActionId: string }> }): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { collectionActionId } = await context.params;
    const body = await readJsonObject(request);
    const operation = requiredString(body, "operation");
    if (operation === "request") {
      const status = requiredStringEnum(body, "status", LIFECYCLE_STATUSES);
      const approval = await requestCollectionLifecycleApproval(authContext, collectionActionId, status);
      return ok({ approval: { approvalId: approval.approvalId, expiresAt: approval.expiresAt, collectionActionId, status } });
    }
    const approvalId = requiredString(body, "approvalId");
    if (operation === "cancel") {
      await cancelCollectionLifecycleApproval(authContext, approvalId);
      return ok({ cancelled: true });
    }
    if (operation !== "confirm") throw new Error("INVALID_OPERATION");
    const status = requiredStringEnum(body, "status", LIFECYCLE_STATUSES);
    const execution = await executeApprovedCollectionLifecycle({
      authContext,
      collectionActionId,
      status,
      approvalId,
      idempotencyKey: requiredIdempotencyKey(request),
      correlationId: request.headers.get("X-Correlation-Id")?.trim() || randomUUID(),
    });
    return ok({ execution });
  } catch (error) { return mapExecutionErrorToHttpResponse(error); }
}
