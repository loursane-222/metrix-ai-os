import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { policyEngine } from "../policy";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import { PolicyDeniedError } from "../execution";
import { executeApprovedAction } from "./approved-action-execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest, computeNormalizedInputHash } from "./execution-request";

export type FinancialInstrumentClearFields = {
  instrumentId: string;
  paymentMethod: string;
  financialAccountReference: string;
  occurredAt?: string;
};

/**
 * Bkz. payment-apply-gateway.ts / supplier-payment-apply-gateway.ts — aynı
 * CONDITIONAL/HIGH-risk request→confirm→execute onay deseni,
 * financialInstrument.clear için (gerçek para hareketi).
 */
function base(authContext: AuthContext, fields: FinancialInstrumentClearFields) {
  const input = { instrumentId: fields.instrumentId, paymentMethod: fields.paymentMethod, financialAccountReference: fields.financialAccountReference, occurredAt: fields.occurredAt };
  const entityRef = { entityType: "financial_instrument", entityId: fields.instrumentId };
  return {
    input,
    entityRef,
    executionContext: buildExecutionContext(authContext),
    normalizedInputHash: computeNormalizedInputHash({ actionName: "financialInstrument.clear", input, entityRef }),
  };
}

export async function requestFinancialInstrumentClearApproval(authContext: AuthContext, fields: FinancialInstrumentClearFields) {
  const candidate = base(authContext, fields);
  const decision = await policyEngine.evaluatePolicy({
    actionName: "financialInstrument.clear",
    actorContext: candidate.executionContext,
    targetEntityRef: candidate.entityRef,
    normalizedInputHash: candidate.normalizedInputHash,
  });
  if (decision.outcome === "DENY") throw new PolicyDeniedError("financialInstrument.clear", decision.reasonCode);
  if (!decision.approvalRequest) throw new Error("APPROVAL_NOT_CREATED");
  return decision.approvalRequest;
}

export async function cancelFinancialInstrumentClearApproval(authContext: AuthContext, approvalId: string) {
  const request = await policyEngine.getApprovalRequest(approvalId);
  if (
    request.actorId !== authContext.user.id ||
    request.organizationId !== authContext.organization.id ||
    request.actionName !== "financialInstrument.clear"
  ) {
    throw new Error("APPROVAL_NOT_FOUND");
  }
  await policyEngine.revokeApproval(approvalId, authContext.user.id);
}

export async function executeApprovedFinancialInstrumentClear(input: {
  authContext: AuthContext;
  fields: FinancialInstrumentClearFields;
  approvalId: string;
  idempotencyKey: string;
  correlationId: string;
}) {
  const candidate = base(input.authContext, input.fields);
  return executeApprovedAction({
    approvalId: input.approvalId,
    grantedBy: input.authContext.user.id,
    request: buildActionExecutionRequest({
      actionName: "financialInstrument.clear",
      input: candidate.input,
      entityRef: candidate.entityRef,
      executionContext: candidate.executionContext,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "IRREVERSIBLE" },
    }),
  }, { policy: policyEngine, runtime: productionExecutionRuntime });
}
