import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { policyEngine } from "../policy";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import { PolicyDeniedError } from "../execution";
import { executeApprovedAction } from "./approved-action-execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest, computeNormalizedInputHash } from "./execution-request";

/**
 * Bkz. settlement-reverse-gateway.ts / expense-settlement-reverse-gateway.ts
 * — aynı desen, supplierPayment.reverse için.
 */
function base(authContext: AuthContext, supplierPaymentId: string, reason: string) {
  const input = { supplierPaymentId, reason };
  const entityRef = { entityType: "supplier_payment", entityId: supplierPaymentId };
  return {
    input,
    entityRef,
    executionContext: buildExecutionContext(authContext),
    normalizedInputHash: computeNormalizedInputHash({ actionName: "supplierPayment.reverse", input, entityRef }),
  };
}

export async function requestSupplierPaymentReverseApproval(authContext: AuthContext, supplierPaymentId: string, reason: string) {
  const candidate = base(authContext, supplierPaymentId, reason);
  const decision = await policyEngine.evaluatePolicy({
    actionName: "supplierPayment.reverse",
    actorContext: candidate.executionContext,
    targetEntityRef: candidate.entityRef,
    normalizedInputHash: candidate.normalizedInputHash,
  });
  if (decision.outcome === "DENY") throw new PolicyDeniedError("supplierPayment.reverse", decision.reasonCode);
  if (!decision.approvalRequest) throw new Error("APPROVAL_NOT_CREATED");
  return decision.approvalRequest;
}

export async function cancelSupplierPaymentReverseApproval(authContext: AuthContext, approvalId: string) {
  const request = await policyEngine.getApprovalRequest(approvalId);
  if (
    request.actorId !== authContext.user.id ||
    request.organizationId !== authContext.organization.id ||
    request.actionName !== "supplierPayment.reverse"
  ) {
    throw new Error("APPROVAL_NOT_FOUND");
  }
  await policyEngine.revokeApproval(approvalId, authContext.user.id);
}

export async function executeApprovedSupplierPaymentReverse(input: {
  authContext: AuthContext;
  supplierPaymentId: string;
  reason: string;
  approvalId: string;
  idempotencyKey: string;
  correlationId: string;
}) {
  const candidate = base(input.authContext, input.supplierPaymentId, input.reason);
  return executeApprovedAction({
    approvalId: input.approvalId,
    grantedBy: input.authContext.user.id,
    request: buildActionExecutionRequest({
      actionName: "supplierPayment.reverse",
      input: candidate.input,
      entityRef: candidate.entityRef,
      executionContext: candidate.executionContext,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "IRREVERSIBLE" },
    }),
  }, { policy: policyEngine, runtime: productionExecutionRuntime });
}
