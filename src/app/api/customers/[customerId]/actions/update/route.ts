import { randomUUID } from "crypto";

import { ok } from "@/lib/api/response";
import {
  readJsonObject,
  requiredIdempotencyKey,
  requiredNumber,
  requiredRecord,
  requiredString,
} from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { executeCustomerUpdateGateway } from "@/lib/action-runtime/gateway/customer-update-gateway";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";

const CORRELATION_ID_HEADER = "X-Correlation-Id";

function resolveCorrelationId(request: Request): string {
  const header = request.headers.get(CORRELATION_ID_HEADER)?.trim();
  return header && header.length > 0 ? header : randomUUID();
}

/**
 * Customers Edit için tek, dar server sınırı: yalnızca customer.update
 * çalıştırabilir. Client'tan gelen actionName/entityRef/organizationId/
 * actorId/permissions'a asla güvenilmez — bunların hepsi burada, trusted
 * auth context ve route parametresinden yeniden inşa edilir. Gerçek
 * execution mantığı executeCustomerUpdateGateway'de yaşar; bu route yalnızca
 * HTTP'ye özgü ayrıştırma/hata eşlemesi yapan ince bir katmandır.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ customerId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { customerId } = await context.params;

    const idempotencyKey = requiredIdempotencyKey(request);
    const correlationId = resolveCorrelationId(request);
    const body = await readJsonObject(request);

    const patch = requiredRecord(body, "patch");
    const expectedVersion = requiredString(body, "expectedVersion");
    requiredString(body, "originatingDraftId");
    requiredNumber(body, "originatingContextVersion");

    const result = await executeCustomerUpdateGateway({
      authContext,
      customerId,
      patch,
      expectedVersion,
      idempotencyKey,
      correlationId,
    });

    return ok({ execution: result });
  } catch (error: unknown) {
    return mapExecutionErrorToHttpResponse(error);
  }
}
