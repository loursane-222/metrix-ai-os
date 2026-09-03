import { randomUUID } from "crypto";
import { ok } from "@/lib/api/response";
import { optionalString, readJsonObject, requiredIdempotencyKey, requiredNumber, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import {
  cancelPaymentApplyApproval,
  requestPaymentApplyApproval,
  type PaymentApplyFields,
} from "@/lib/action-runtime/gateway/payment-apply-gateway";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import type { RequestBody } from "@/lib/api/validation";
import { executeCanonicalOperation, canonicalOperationResultToHttpResponse } from "@/lib/canonical-operation";

/**
 * Bkz. src/app/api/customers/[customerId]/actions/archive/route.ts — aynı
 * tek-route request/cancel/confirm deseni. paymentId + amount + method +
 * financialAccountReference, hem approval talebinde hem onaylanmış
 * çalıştırmada aynı normalizedInputHash'i üretebilmek için ikisinde de
 * body'de taşınır.
 */
export async function POST(request: Request, context: { params: Promise<{ paymentId: string }> }): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { paymentId } = await context.params;
    const body = await readJsonObject(request);
    const operation = requiredString(body, "operation");

    if (operation === "request") {
      const approval = await requestPaymentApplyApproval(authContext, readPaymentApplyFields(body, paymentId));
      return ok({ approval: { approvalId: approval.approvalId, expiresAt: approval.expiresAt, paymentId } });
    }

    const approvalId = requiredString(body, "approvalId");

    if (operation === "cancel") {
      await cancelPaymentApplyApproval(authContext, approvalId);
      return ok({ cancelled: true });
    }

    if (operation !== "confirm") throw new Error("INVALID_OPERATION");

    const fields = readPaymentApplyFields(body, paymentId);
    const idempotencyKey = requiredIdempotencyKey(request);
    const correlationId = request.headers.get("X-Correlation-Id")?.trim() || randomUUID();
    const result = await executeCanonicalOperation(
      {
        operationId: idempotencyKey,
        correlationId,
        organizationId: authContext.organization.id,
        actorId: authContext.user.id,
        source: "system",
        type: "CREATE",
        domain: "settlement",
        entity: { entityType: "payment", entityId: paymentId },
        capability: "settlement.create",
        payload: {
          paymentId: fields.paymentId,
          amount: fields.amount,
          paymentMethod: fields.paymentMethod,
          financialAccountReference: fields.financialAccountReference,
          occurredAt: fields.occurredAt,
          idempotencyKey: fields.idempotencyKey,
        },
        revealIntent: { explicit: false },
      },
      { authContext, approvalContext: { approvalId, grantedBy: authContext.user.id } },
    );
    return canonicalOperationResultToHttpResponse(result, "payment.apply");
  } catch (error) {
    return mapExecutionErrorToHttpResponse(error);
  }
}

function readPaymentApplyFields(body: RequestBody, paymentId: string): PaymentApplyFields {
  return {
    paymentId,
    amount: requiredNumber(body, "amount"),
    paymentMethod: requiredString(body, "paymentMethod"),
    financialAccountReference: requiredString(body, "financialAccountReference"),
    occurredAt: optionalString(body, "occurredAt"),
    idempotencyKey: optionalString(body, "settlementIdempotencyKey"),
  };
}
