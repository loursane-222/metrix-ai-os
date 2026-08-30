import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { policyEngine } from "../policy";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import { PolicyDeniedError } from "../execution";
import { executeApprovedAction } from "./approved-action-execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest, computeNormalizedInputHash } from "./execution-request";

export type SupplierPaymentApplyFields = {
  purchaseInvoiceId: string;
  amount: number;
  paymentMethod: string;
  financialAccountReference: string;
  occurredAt?: string;
  idempotencyKey?: string;
};

/**
 * Bkz. payment-apply-gateway.ts / expense-settle-gateway.ts — aynı
 * CONDITIONAL/HIGH-risk request→confirm→execute onay deseni,
 * supplierPayment.apply için (gerçek para çıkışı).
 */
function base(authContext: AuthContext, fields: SupplierPaymentApplyFields) {
  const input = { purchaseInvoiceId: fields.purchaseInvoiceId, amount: fields.amount, paymentMethod: fields.paymentMethod, financialAccountReference: fields.financialAccountReference, occurredAt: fields.occurredAt, idempotencyKey: fields.idempotencyKey };
  const entityRef = { entityType: "purchase_invoice", entityId: fields.purchaseInvoiceId };
  return {
    input,
    entityRef,
    executionContext: buildExecutionContext(authContext),
    normalizedInputHash: computeNormalizedInputHash({ actionName: "supplierPayment.apply", input, entityRef }),
  };
}

export async function requestSupplierPaymentApplyApproval(authContext: AuthContext, fields: SupplierPaymentApplyFields) {
  const candidate = base(authContext, fields);
  const decision = await policyEngine.evaluatePolicy({
    actionName: "supplierPayment.apply",
    actorContext: candidate.executionContext,
    targetEntityRef: candidate.entityRef,
    normalizedInputHash: candidate.normalizedInputHash,
  });
  if (decision.outcome === "DENY") throw new PolicyDeniedError("supplierPayment.apply", decision.reasonCode);
  if (!decision.approvalRequest) throw new Error("APPROVAL_NOT_CREATED");
  return decision.approvalRequest;
}

export async function cancelSupplierPaymentApplyApproval(authContext: AuthContext, approvalId: string) {
  const request = await policyEngine.getApprovalRequest(approvalId);
  if (
    request.actorId !== authContext.user.id ||
    request.organizationId !== authContext.organization.id ||
    request.actionName !== "supplierPayment.apply"
  ) {
    throw new Error("APPROVAL_NOT_FOUND");
  }
  await policyEngine.revokeApproval(approvalId, authContext.user.id);
}

export async function executeApprovedSupplierPaymentApply(input: {
  authContext: AuthContext;
  fields: SupplierPaymentApplyFields;
  approvalId: string;
  idempotencyKey: string;
  correlationId: string;
}) {
  const candidate = base(input.authContext, input.fields);
  return executeApprovedAction({
    approvalId: input.approvalId,
    grantedBy: input.authContext.user.id,
    request: buildActionExecutionRequest({
      actionName: "supplierPayment.apply",
      input: candidate.input,
      entityRef: candidate.entityRef,
      executionContext: candidate.executionContext,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "IRREVERSIBLE" },
    }),
  }, { policy: policyEngine, runtime: productionExecutionRuntime });
}
