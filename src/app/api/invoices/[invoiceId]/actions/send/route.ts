import { randomUUID } from "crypto";
import { ok } from "@/lib/api/response";
import { requiredIdempotencyKey } from "@/lib/api/validation";
import { executeInvoiceSendGateway } from "@/lib/action-runtime/gateway/invoice-send-gateway";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { resolveActionResultV1 } from "@/lib/action-result";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";

export async function POST(
  request: Request,
  context: { params: Promise<{ invoiceId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { invoiceId } = await context.params;
    const result = await executeInvoiceSendGateway({
      authContext,
      invoiceId,
      idempotencyKey: requiredIdempotencyKey(request),
      correlationId: request.headers.get("X-Correlation-Id")?.trim() || randomUUID(),
    });
    resolveActionResultV1(result);
    return ok({ execution: result });
  } catch (error) {
    return mapExecutionErrorToHttpResponse(error);
  }
}
