import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { policyEngine } from "../policy";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import { PolicyDeniedError } from "../execution";
import { executeApprovedAction } from "./approved-action-execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest, computeNormalizedInputHash } from "./execution-request";

export type ExpenseSettleFields = {
  expenseId: string;
  amount: number;
  paymentMethod: string;
  financialAccountReference: string;
  occurredAt?: string;
  idempotencyKey?: string;
};

/**
 * Bkz. payment-apply-gateway.ts — aynı CONDITIONAL/HIGH-risk request→
 * confirm→execute onay deseni, expense.settle için. input tam olarak
 * para-hareketi parametrelerini (method+account dahil) taşır. fields.
 * idempotencyKey domain-level (ExpenseSettlement replay authority) —
 * executeApprovedExpenseSettle'ın kendi idempotencyKey parametresi
 * (transport-level, execution-request retry) ile karıştırılmamalı; ikisi
 * ayrı katmandır (bkz. settlement.service.ts'in aynı ayrımı).
 */
function base(authContext: AuthContext, fields: ExpenseSettleFields) {
  const input = { expenseId: fields.expenseId, amount: fields.amount, paymentMethod: fields.paymentMethod, financialAccountReference: fields.financialAccountReference, occurredAt: fields.occurredAt, idempotencyKey: fields.idempotencyKey };
  const entityRef = { entityType: "expense", entityId: fields.expenseId };
  return {
    input,
    entityRef,
    executionContext: buildExecutionContext(authContext),
    normalizedInputHash: computeNormalizedInputHash({ actionName: "expense.settle", input, entityRef }),
  };
}

export async function requestExpenseSettleApproval(authContext: AuthContext, fields: ExpenseSettleFields) {
  const candidate = base(authContext, fields);
  const decision = await policyEngine.evaluatePolicy({
    actionName: "expense.settle",
    actorContext: candidate.executionContext,
    targetEntityRef: candidate.entityRef,
    normalizedInputHash: candidate.normalizedInputHash,
  });
  if (decision.outcome === "DENY") throw new PolicyDeniedError("expense.settle", decision.reasonCode);
  if (!decision.approvalRequest) throw new Error("APPROVAL_NOT_CREATED");
  return decision.approvalRequest;
}

export async function cancelExpenseSettleApproval(authContext: AuthContext, approvalId: string) {
  const request = await policyEngine.getApprovalRequest(approvalId);
  if (
    request.actorId !== authContext.user.id ||
    request.organizationId !== authContext.organization.id ||
    request.actionName !== "expense.settle"
  ) {
    throw new Error("APPROVAL_NOT_FOUND");
  }
  await policyEngine.revokeApproval(approvalId, authContext.user.id);
}

export async function executeApprovedExpenseSettle(input: {
  authContext: AuthContext;
  fields: ExpenseSettleFields;
  approvalId: string;
  idempotencyKey: string;
  correlationId: string;
}) {
  const candidate = base(input.authContext, input.fields);
  return executeApprovedAction({
    approvalId: input.approvalId,
    grantedBy: input.authContext.user.id,
    request: buildActionExecutionRequest({
      actionName: "expense.settle",
      input: candidate.input,
      entityRef: candidate.entityRef,
      executionContext: candidate.executionContext,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "IRREVERSIBLE" },
    }),
  }, { policy: policyEngine, runtime: productionExecutionRuntime });
}
