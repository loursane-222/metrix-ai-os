import { ok } from "@/lib/api/response";
import { readJsonObject, requiredIdempotencyKey, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { executeDocumentDuplicateUpdate } from "@/lib/customers/customer-document-duplicate-update-service";

export async function POST(request: Request, context: { params: Promise<{ attachmentRef: string }> }): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { attachmentRef } = await context.params;
    const body = await readJsonObject(request);
    if (Object.keys(body).some((key) => key !== "customerId")) throw new Error("INVALID_DUPLICATE_UPDATE_REQUEST");
    const result = await executeDocumentDuplicateUpdate({ authContext, attachmentRef, customerId: requiredString(body, "customerId"), idempotencyKey: requiredIdempotencyKey(request), correlationId: request.headers.get("X-Correlation-Id")?.trim() });
    return ok(result);
  } catch (error) { return mapExecutionErrorToHttpResponse(error); }
}
