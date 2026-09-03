import { randomUUID } from "crypto";

import { requiredIdempotencyKey } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { executeCanonicalOperation, canonicalOperationResultToHttpResponse } from "@/lib/canonical-operation";

const CORRELATION_ID_HEADER = "X-Correlation-Id";

function resolveCorrelationId(request: Request): string {
  const header = request.headers.get(CORRELATION_ID_HEADER)?.trim();
  return header && header.length > 0 ? header : randomUUID();
}

/** "Teklifi müşteriye gönder" için tek, dar server sınırı: yalnızca quote.send capability'sini çalıştırır. */
export async function POST(
  request: Request,
  context: { params: Promise<{ quoteId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { quoteId } = await context.params;

    const idempotencyKey = requiredIdempotencyKey(request);
    const correlationId = resolveCorrelationId(request);

    const result = await executeCanonicalOperation(
      {
        operationId: idempotencyKey,
        correlationId,
        organizationId: authContext.organization.id,
        actorId: authContext.user.id,
        source: "system",
        type: "UPDATE",
        domain: "quote",
        entity: { entityType: "quote", entityId: quoteId },
        capability: "quote.send",
        payload: { quoteId },
        revealIntent: { explicit: false },
      },
      { authContext },
    );

    return canonicalOperationResultToHttpResponse(result, "quote.send");
  } catch (error: unknown) {
    return mapExecutionErrorToHttpResponse(error);
  }
}
