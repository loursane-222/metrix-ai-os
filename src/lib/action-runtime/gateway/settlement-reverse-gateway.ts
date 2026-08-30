import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { policyEngine } from "../policy";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import { PolicyDeniedError } from "../execution";
import { executeApprovedAction } from "./approved-action-execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest, computeNormalizedInputHash } from "./execution-request";

/**
 * Bkz. payment-apply-gateway.ts — settlement.reverse için aynı CONDITIONAL/
 * HIGH-risk request→confirm→execute onay deseni. settlement.reverse'in tek
 * çağrılan yolu budur.
 */
function base(authContext: AuthContext, settlementId: string, reason: string) {
  const input = { settlementId, reason };
  const entityRef = { entityType: "settlement", entityId: settlementId };
  return {
    input,
    entityRef,
    executionContext: buildExecutionContext(authContext),
    normalizedInputHash: computeNormalizedInputHash({ actionName: "settlement.reverse", input, entityRef }),
  };
}

export async function requestSettlementReverseApproval(authContext: AuthContext, settlementId: string, reason: string) {
  const candidate = base(authContext, settlementId, reason);
  const decision = await policyEngine.evaluatePolicy({
    actionName: "settlement.reverse",
    actorContext: candidate.executionContext,
    targetEntityRef: candidate.entityRef,
    normalizedInputHash: candidate.normalizedInputHash,
  });
  if (decision.outcome === "DENY") throw new PolicyDeniedError("settlement.reverse", decision.reasonCode);
  if (!decision.approvalRequest) throw new Error("APPROVAL_NOT_CREATED");
  return decision.approvalRequest;
}

export async function cancelSettlementReverseApproval(authContext: AuthContext, approvalId: string) {
  const request = await policyEngine.getApprovalRequest(approvalId);
  if (
    request.actorId !== authContext.user.id ||
    request.organizationId !== authContext.organization.id ||
    request.actionName !== "settlement.reverse"
  ) {
    throw new Error("APPROVAL_NOT_FOUND");
  }
  await policyEngine.revokeApproval(approvalId, authContext.user.id);
}

export async function executeApprovedSettlementReverse(input: {
  authContext: AuthContext;
  settlementId: string;
  reason: string;
  approvalId: string;
  idempotencyKey: string;
  correlationId: string;
}) {
  const candidate = base(input.authContext, input.settlementId, input.reason);
  return executeApprovedAction({
    approvalId: input.approvalId,
    grantedBy: input.authContext.user.id,
    request: buildActionExecutionRequest({
      actionName: "settlement.reverse",
      input: candidate.input,
      entityRef: candidate.entityRef,
      executionContext: candidate.executionContext,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "IRREVERSIBLE" },
    }),
  }, { policy: policyEngine, runtime: productionExecutionRuntime });
}
