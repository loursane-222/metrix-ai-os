import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { policyEngine } from "../policy";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import { PolicyDeniedError } from "../execution";
import { executeApprovedAction } from "./approved-action-execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest, computeNormalizedInputHash } from "./execution-request";

/**
 * Bkz. customer-archive-gateway.ts / quote-dispatch-gateway.ts — payment.apply
 * için aynı CONDITIONAL/HIGH-risk request→confirm→execute approval deseni.
 * Bu, payment.apply'ın tek çağrılan yolu olmalıdır: hangi Living Workspace
 * yüzeyi (Collections, Customer, Invoice, Notification, Executive öneri,
 * ileride konuşma) tetiklerse tetiklesin, hepsi aynı bu üç fonksiyona,
 * dolayısıyla aynı Action Runtime/persistence/read-back/notification
 * zincirine düşer — ikinci bir mutation authority oluşmaz.
 */
export type PaymentApplyFields = {
  paymentId: string;
  amount: number;
  paymentMethod: string;
  financialAccountReference: string;
  occurredAt?: string;
  idempotencyKey?: string;
};

/**
 * input tam olarak para-hareketi parametrelerini (method+account dahil)
 * taşımalıdır — approval'ın bağlandığı normalizedInputHash bunları
 * kapsamazsa, biri "500 TL nakit Kasa'ya" için onay alıp confirm adımında
 * farklı bir method/hesapla çalıştırabilir (executeApprovedAction yalnızca
 * hash eşitliğine bakar).
 */
function base(authContext: AuthContext, fields: PaymentApplyFields) {
  const input = { paymentId: fields.paymentId, amount: fields.amount, paymentMethod: fields.paymentMethod, financialAccountReference: fields.financialAccountReference, occurredAt: fields.occurredAt, idempotencyKey: fields.idempotencyKey };
  const entityRef = { entityType: "payment", entityId: fields.paymentId };
  return {
    input,
    entityRef,
    executionContext: buildExecutionContext(authContext),
    normalizedInputHash: computeNormalizedInputHash({ actionName: "payment.apply", input, entityRef }),
  };
}

export async function requestPaymentApplyApproval(authContext: AuthContext, fields: PaymentApplyFields) {
  const candidate = base(authContext, fields);
  const decision = await policyEngine.evaluatePolicy({
    actionName: "payment.apply",
    actorContext: candidate.executionContext,
    targetEntityRef: candidate.entityRef,
    normalizedInputHash: candidate.normalizedInputHash,
  });
  if (decision.outcome === "DENY") throw new PolicyDeniedError("payment.apply", decision.reasonCode);
  if (!decision.approvalRequest) throw new Error("APPROVAL_NOT_CREATED");
  return decision.approvalRequest;
}

export async function cancelPaymentApplyApproval(authContext: AuthContext, approvalId: string) {
  const request = await policyEngine.getApprovalRequest(approvalId);
  if (
    request.actorId !== authContext.user.id ||
    request.organizationId !== authContext.organization.id ||
    request.actionName !== "payment.apply"
  ) {
    throw new Error("APPROVAL_NOT_FOUND");
  }
  await policyEngine.revokeApproval(approvalId, authContext.user.id);
}

export async function executeApprovedPaymentApply(input: {
  authContext: AuthContext;
  fields: PaymentApplyFields;
  approvalId: string;
  idempotencyKey: string;
  correlationId: string;
}) {
  const candidate = base(input.authContext, input.fields);
  return executeApprovedAction({
    approvalId: input.approvalId,
    grantedBy: input.authContext.user.id,
    request: buildActionExecutionRequest({
      actionName: "payment.apply",
      input: candidate.input,
      entityRef: candidate.entityRef,
      executionContext: candidate.executionContext,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "IRREVERSIBLE" },
    }),
  }, { policy: policyEngine, runtime: productionExecutionRuntime });
}
