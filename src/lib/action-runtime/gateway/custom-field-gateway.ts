import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import type { ApprovalGrant, TargetEntityRef } from "../policy";
import { policyEngine } from "../policy";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import { ApprovalRequiredError, PolicyDeniedError } from "../execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest, computeNormalizedInputHash } from "./execution-request";

export type CustomFieldActionName = "custom_field.create" | "custom_field.update_definition" | "custom_field.deprecate";
function candidate(authContext: AuthContext, actionName: CustomFieldActionName, input: Record<string, unknown>, entityRef?: TargetEntityRef) {
  const executionContext = buildExecutionContext(authContext);
  return { actionName, input, entityRef, executionContext, normalizedInputHash: computeNormalizedInputHash({ actionName, input, entityRef }) };
}
export function requestCustomFieldApproval(authContext: AuthContext, actionName: CustomFieldActionName, input: Record<string, unknown>, entityRef?: TargetEntityRef) {
  const value = candidate(authContext, actionName, input, entityRef);
  const decision = policyEngine.evaluatePolicy({ actionName, actorContext: value.executionContext, targetEntityRef: entityRef, normalizedInputHash: value.normalizedInputHash });
  if (decision.outcome === "DENY") throw new PolicyDeniedError(actionName, decision.reasonCode);
  if (!decision.approvalRequest) throw new Error("APPROVAL_NOT_CREATED");
  return decision.approvalRequest;
}
export function cancelCustomFieldApproval(authContext: AuthContext, approvalId: string) { const approval = policyEngine.getApprovalRequest(approvalId); if (approval.actorId !== authContext.user.id || approval.organizationId !== authContext.organization.id || !approval.actionName.startsWith("custom_field.")) throw new Error("APPROVAL_NOT_FOUND"); policyEngine.revokeApproval(approvalId); }
export async function executeApprovedCustomFieldAction(args: { authContext: AuthContext; actionName: CustomFieldActionName; input: Record<string, unknown>; entityRef?: TargetEntityRef; approvalId: string; idempotencyKey: string; correlationId: string }) {
  const value = candidate(args.authContext, args.actionName, args.input, args.entityRef); const approval = policyEngine.getApprovalRequest(args.approvalId);
  if (approval.actionName !== args.actionName || approval.actorId !== value.executionContext.actorId || approval.organizationId !== value.executionContext.organizationId || approval.normalizedInputHash !== value.normalizedInputHash || JSON.stringify(approval.targetEntityRef ?? null) !== JSON.stringify(args.entityRef ?? null)) throw new ApprovalRequiredError(args.actionName, "APPROVAL_CONTEXT_MISMATCH");
  const grant: ApprovalGrant = policyEngine.grantApproval(args.approvalId, args.authContext.user.id);
  return productionExecutionRuntime.executeAction(buildActionExecutionRequest({ actionName: args.actionName, input: args.input, entityRef: args.entityRef, executionContext: value.executionContext, idempotencyKey: args.idempotencyKey, correlationId: args.correlationId, approvalGrant: grant, runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "REVERSIBLE" } }));
}
