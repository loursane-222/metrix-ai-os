import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { policyEngine } from "../policy";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import { PolicyDeniedError } from "../execution";
import { executeApprovedAction } from "./approved-action-execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest, computeNormalizedInputHash } from "./execution-request";

function base(authContext: AuthContext, customerId: string) {
  const input = { customerId };
  const entityRef = { entityType: "customer", entityId: customerId };
  return { input, entityRef, executionContext: buildExecutionContext(authContext), normalizedInputHash: computeNormalizedInputHash({ actionName: "customer.archive", input, entityRef }) };
}
export async function requestCustomerArchiveApproval(authContext: AuthContext, customerId: string) {
  const candidate = base(authContext, customerId);
  const decision = await policyEngine.evaluatePolicy({ actionName: "customer.archive", actorContext: candidate.executionContext, targetEntityRef: candidate.entityRef, normalizedInputHash: candidate.normalizedInputHash });
  if (decision.outcome === "DENY") throw new PolicyDeniedError("customer.archive", decision.reasonCode);
  if (!decision.approvalRequest) throw new Error("APPROVAL_NOT_CREATED");
  return decision.approvalRequest;
}
export async function cancelCustomerArchiveApproval(authContext: AuthContext, approvalId: string) {
  const request = await policyEngine.getApprovalRequest(approvalId);
  if (request.actorId !== authContext.user.id || request.organizationId !== authContext.organization.id || request.actionName !== "customer.archive") throw new Error("APPROVAL_NOT_FOUND");
  await policyEngine.revokeApproval(approvalId, authContext.user.id);
}
export async function executeApprovedCustomerArchive(input: { authContext: AuthContext; customerId: string; approvalId: string; idempotencyKey: string; correlationId: string }) {
  const candidate = base(input.authContext, input.customerId);
  return executeApprovedAction({
    approvalId: input.approvalId,
    grantedBy: input.authContext.user.id,
    request: buildActionExecutionRequest({ actionName: "customer.archive", input: candidate.input, entityRef: candidate.entityRef, executionContext: candidate.executionContext, idempotencyKey: input.idempotencyKey, correlationId: input.correlationId, runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "REVERSIBLE" } }),
  }, { policy: policyEngine, runtime: productionExecutionRuntime });
}
