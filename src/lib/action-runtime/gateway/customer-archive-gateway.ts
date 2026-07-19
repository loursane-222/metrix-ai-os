import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import type { ApprovalGrant } from "../policy";
import { policyEngine } from "../policy";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import { ApprovalRequiredError, PolicyDeniedError } from "../execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest, computeNormalizedInputHash } from "./execution-request";

function base(authContext: AuthContext, customerId: string) {
  const input = { customerId };
  const entityRef = { entityType: "customer", entityId: customerId };
  return { input, entityRef, executionContext: buildExecutionContext(authContext), normalizedInputHash: computeNormalizedInputHash({ actionName: "customer.archive", input, entityRef }) };
}
export function requestCustomerArchiveApproval(authContext: AuthContext, customerId: string) {
  const candidate = base(authContext, customerId);
  const decision = policyEngine.evaluatePolicy({ actionName: "customer.archive", actorContext: candidate.executionContext, targetEntityRef: candidate.entityRef, normalizedInputHash: candidate.normalizedInputHash });
  if (decision.outcome === "DENY") throw new PolicyDeniedError("customer.archive", decision.reasonCode);
  if (!decision.approvalRequest) throw new Error("APPROVAL_NOT_CREATED");
  return decision.approvalRequest;
}
export function cancelCustomerArchiveApproval(authContext: AuthContext, approvalId: string) {
  const request = policyEngine.getApprovalRequest(approvalId);
  if (request.actorId !== authContext.user.id || request.organizationId !== authContext.organization.id || request.actionName !== "customer.archive") throw new Error("APPROVAL_NOT_FOUND");
  policyEngine.revokeApproval(approvalId);
}
export async function executeApprovedCustomerArchive(input: { authContext: AuthContext; customerId: string; approvalId: string; idempotencyKey: string; correlationId: string }) {
  const candidate = base(input.authContext, input.customerId);
  const approval = policyEngine.getApprovalRequest(input.approvalId);
  if (approval.actionName !== "customer.archive" || approval.actorId !== candidate.executionContext.actorId || approval.organizationId !== candidate.executionContext.organizationId || approval.targetEntityRef?.entityType !== candidate.entityRef.entityType || approval.targetEntityRef.entityId !== candidate.entityRef.entityId || approval.normalizedInputHash !== candidate.normalizedInputHash) {
    throw new ApprovalRequiredError("customer.archive", "APPROVAL_CONTEXT_MISMATCH");
  }
  const grant: ApprovalGrant = policyEngine.grantApproval(input.approvalId, input.authContext.user.id);
  return productionExecutionRuntime.executeAction(buildActionExecutionRequest({ actionName: "customer.archive", input: candidate.input, entityRef: candidate.entityRef, executionContext: candidate.executionContext, idempotencyKey: input.idempotencyKey, correlationId: input.correlationId, approvalGrant: grant, runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "REVERSIBLE" } }));
}
