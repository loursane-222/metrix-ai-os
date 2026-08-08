import { randomUUID } from "crypto";
import { ok } from "@/lib/api/response";
import { requiredIdempotencyKey } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { executeTaskCompleteGateway } from "@/lib/action-runtime/gateway/task-complete-gateway";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { resolveActionResultV1 } from "@/lib/action-result";

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }): Promise<Response> {
  try {
    const [authContext, { taskId }] = await Promise.all([requireAuthContextFromCookies(), context.params]);
    const result = await executeTaskCompleteGateway({ authContext, taskId, idempotencyKey: requiredIdempotencyKey(request), correlationId: request.headers.get("X-Correlation-Id")?.trim() || randomUUID() });
    resolveActionResultV1(result);
    return ok({ execution: result });
  } catch (error) { return mapExecutionErrorToHttpResponse(error); }
}
