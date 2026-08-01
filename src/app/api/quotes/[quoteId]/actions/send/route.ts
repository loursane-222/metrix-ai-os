import { randomUUID } from "crypto";

import { ok } from "@/lib/api/response";
import { requiredIdempotencyKey } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { executeQuoteSendGateway } from "@/lib/action-runtime/gateway/quote-send-gateway";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { resolveActionResultV1 } from "@/lib/action-result";

const CORRELATION_ID_HEADER = "X-Correlation-Id";

function resolveCorrelationId(request: Request): string {
  const header = request.headers.get(CORRELATION_ID_HEADER)?.trim();
  return header && header.length > 0 ? header : randomUUID();
}

/** "Teklifi müşteriye gönder" için tek, dar server sınırı: yalnızca quote.send çalıştırır. */
export async function POST(
  request: Request,
  context: { params: Promise<{ quoteId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { quoteId } = await context.params;

    const idempotencyKey = requiredIdempotencyKey(request);
    const correlationId = resolveCorrelationId(request);

    const result = await executeQuoteSendGateway({ authContext, quoteId, idempotencyKey, correlationId });
    resolveActionResultV1(result);

    return ok({ execution: result });
  } catch (error: unknown) {
    return mapExecutionErrorToHttpResponse(error);
  }
}
