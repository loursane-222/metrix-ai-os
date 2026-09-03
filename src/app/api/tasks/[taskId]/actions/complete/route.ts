import { randomUUID } from "crypto";
import { requiredIdempotencyKey } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { executeCanonicalOperation, canonicalOperationResultToHttpResponse } from "@/lib/canonical-operation";

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }): Promise<Response> {
  try {
    const [authContext, { taskId }] = await Promise.all([requireAuthContextFromCookies(), context.params]);
    const correlationId = request.headers.get("X-Correlation-Id")?.trim() || randomUUID();
    const result = await executeCanonicalOperation(
      {
        operationId: requiredIdempotencyKey(request),
        correlationId,
        organizationId: authContext.organization.id,
        actorId: authContext.user.id,
        source: "system",
        type: "UPDATE",
        domain: "task",
        entity: { entityType: "task", entityId: taskId },
        capability: "task.complete",
        payload: { taskId },
        revealIntent: { explicit: false },
      },
      { authContext },
    );
    return canonicalOperationResultToHttpResponse(result, "task.complete");
  } catch (error) { return mapExecutionErrorToHttpResponse(error); }
}
