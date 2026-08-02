import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import type { ApprovalGrant } from "../policy";
import { policyEngine } from "../policy";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import { ApprovalRequiredError, PolicyDeniedError } from "../execution";
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
function base(authContext: AuthContext, paymentId: string, amount: number) {
  const input = { paymentId, amount };
  const entityRef = { entityType: "payment", entityId: paymentId };
  return {
    input,
    entityRef,
    executionContext: buildExecutionContext(authContext),
    normalizedInputHash: computeNormalizedInputHash({ actionName: "payment.apply", input, entityRef }),
  };
}

export async function requestPaymentApplyApproval(authContext: AuthContext, paymentId: string, amount: number) {
  const candidate = base(authContext, paymentId, amount);
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
  paymentId: string;
  amount: number;
  approvalId: string;
  idempotencyKey: string;
  correlationId: string;
}) {
  const candidate = base(input.authContext, input.paymentId, input.amount);
  const approval = await policyEngine.getApprovalRequest(input.approvalId);
  if (
    approval.actionName !== "payment.apply" ||
    approval.actorId !== candidate.executionContext.actorId ||
    approval.organizationId !== candidate.executionContext.organizationId ||
    approval.targetEntityRef?.entityType !== candidate.entityRef.entityType ||
    approval.targetEntityRef.entityId !== candidate.entityRef.entityId ||
    approval.normalizedInputHash !== candidate.normalizedInputHash
  ) {
    throw new ApprovalRequiredError("payment.apply", "APPROVAL_CONTEXT_MISMATCH");
  }
  const grant: ApprovalGrant = approval.status === "GRANTED"
    ? await policyEngine.getApprovalGrant(input.approvalId)
    : await policyEngine.grantApproval(input.approvalId, input.authContext.user.id);
  return productionExecutionRuntime.executeAction(
    buildActionExecutionRequest({
      actionName: "payment.apply",
      input: candidate.input,
      entityRef: candidate.entityRef,
      executionContext: candidate.executionContext,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      approvalGrant: grant,
      runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "IRREVERSIBLE" },
    }),
  );
}
