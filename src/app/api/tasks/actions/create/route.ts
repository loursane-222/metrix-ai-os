import { randomUUID } from "crypto";
import { ok } from "@/lib/api/response";
import { readJsonObject, requiredIdempotencyKey } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { executeTaskCreateGateway } from "@/lib/action-runtime/gateway/task-create-gateway";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { resolveActionResultV1 } from "@/lib/action-result";

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const result = await executeTaskCreateGateway({
      authContext,
      idempotencyKey: requiredIdempotencyKey(request),
      correlationId: request.headers.get("X-Correlation-Id")?.trim() || randomUUID(),
      task: body as never,
    });
    resolveActionResultV1(result);
    return ok({ execution: result });
  } catch (error) {
    return mapExecutionErrorToHttpResponse(error);
  }
}
