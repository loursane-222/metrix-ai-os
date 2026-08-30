import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { policyEngine } from "../policy";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import { PolicyDeniedError } from "../execution";
import { executeApprovedAction } from "./approved-action-execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest, computeNormalizedInputHash } from "./execution-request";

/**
 * Bkz. settlement-reverse-gateway.ts — aynı desen, expense.settlement.reverse
 * için.
 */
function base(authContext: AuthContext, expenseSettlementId: string, reason: string) {
  const input = { expenseSettlementId, reason };
  const entityRef = { entityType: "expense_settlement", entityId: expenseSettlementId };
  return {
    input,
    entityRef,
    executionContext: buildExecutionContext(authContext),
    normalizedInputHash: computeNormalizedInputHash({ actionName: "expense.settlement.reverse", input, entityRef }),
  };
}

export async function requestExpenseSettlementReverseApproval(authContext: AuthContext, expenseSettlementId: string, reason: string) {
  const candidate = base(authContext, expenseSettlementId, reason);
  const decision = await policyEngine.evaluatePolicy({
    actionName: "expense.settlement.reverse",
    actorContext: candidate.executionContext,
    targetEntityRef: candidate.entityRef,
    normalizedInputHash: candidate.normalizedInputHash,
  });
  if (decision.outcome === "DENY") throw new PolicyDeniedError("expense.settlement.reverse", decision.reasonCode);
  if (!decision.approvalRequest) throw new Error("APPROVAL_NOT_CREATED");
  return decision.approvalRequest;
}

export async function cancelExpenseSettlementReverseApproval(authContext: AuthContext, approvalId: string) {
  const request = await policyEngine.getApprovalRequest(approvalId);
  if (
    request.actorId !== authContext.user.id ||
    request.organizationId !== authContext.organization.id ||
    request.actionName !== "expense.settlement.reverse"
  ) {
    throw new Error("APPROVAL_NOT_FOUND");
  }
  await policyEngine.revokeApproval(approvalId, authContext.user.id);
}

export async function executeApprovedExpenseSettlementReverse(input: {
  authContext: AuthContext;
  expenseSettlementId: string;
  reason: string;
  approvalId: string;
  idempotencyKey: string;
  correlationId: string;
}) {
  const candidate = base(input.authContext, input.expenseSettlementId, input.reason);
  return executeApprovedAction({
    approvalId: input.approvalId,
    grantedBy: input.authContext.user.id,
    request: buildActionExecutionRequest({
      actionName: "expense.settlement.reverse",
      input: candidate.input,
      entityRef: candidate.entityRef,
      executionContext: candidate.executionContext,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "IRREVERSIBLE" },
    }),
  }, { policy: policyEngine, runtime: productionExecutionRuntime });
}
