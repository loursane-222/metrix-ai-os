import { randomUUID } from "crypto";
import { ok } from "@/lib/api/response";
import { readJsonObject, requiredIdempotencyKey } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { executeCustomerCreateGateway } from "@/lib/action-runtime/gateway/customer-create-gateway";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { validateCustomerCreateBody } from "@/lib/customers/customer-field-authority-input";

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const result = await executeCustomerCreateGateway({
      authContext,
      idempotencyKey: requiredIdempotencyKey(request),
      correlationId: request.headers.get("X-Correlation-Id")?.trim() || randomUUID(),
      customer: validateCustomerCreateBody(body),
    });
    return ok({ execution: result });
  } catch (error) { return mapExecutionErrorToHttpResponse(error); }
}
