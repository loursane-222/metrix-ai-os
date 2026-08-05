import type { ActionExecutionRequest, ExecutionResult } from "../execution";
import { ApprovalRequiredError } from "../execution";
import type { ApprovalGrant, ApprovalRequest, TargetEntityRef } from "../policy";

type ApprovalGatewayPolicy = {
  getApprovalRequest(approvalId: string): Promise<ApprovalRequest>;
  getApprovalGrant(approvalId: string): Promise<ApprovalGrant>;
  grantApproval(approvalId: string, grantedBy: string): Promise<ApprovalGrant>;
};

type ApprovalGatewayRuntime = {
  lookupCompletedResult(request: ActionExecutionRequest): Promise<ExecutionResult | undefined>;
  executeAction(request: ActionExecutionRequest): Promise<ExecutionResult>;
};

export type ExecuteApprovedActionDependencies = {
  policy: ApprovalGatewayPolicy;
  runtime: ApprovalGatewayRuntime;
};

function sameTarget(left: TargetEntityRef | undefined, right: TargetEntityRef | undefined): boolean {
  return left?.entityType === right?.entityType && left?.entityId === right?.entityId;
}

/**
 * Canonical confirm boundary for one-time approvals. A durable completed
 * result owns exact replay before the consumed approval is read or changed.
 */
export async function executeApprovedAction(
  input: {
    request: ActionExecutionRequest;
    approvalId: string;
    grantedBy: string;
  },
  dependencies: ExecuteApprovedActionDependencies,
): Promise<ExecutionResult> {
  const completedResult = await dependencies.runtime.lookupCompletedResult(input.request);
  if (completedResult) return completedResult;

  const approval = await dependencies.policy.getApprovalRequest(input.approvalId);
  const contextMatches = approval.actionName === input.request.actionName
    && approval.actorId === input.request.executionContext.actorId
    && approval.organizationId === input.request.executionContext.organizationId
    && sameTarget(approval.targetEntityRef, input.request.entityRef)
    && approval.normalizedInputHash === input.request.normalizedInputHash;

  if (!contextMatches) {
    throw new ApprovalRequiredError(input.request.actionName, "APPROVAL_CONTEXT_MISMATCH");
  }

  const grant = approval.status === "GRANTED"
    ? await dependencies.policy.getApprovalGrant(input.approvalId)
    : await dependencies.policy.grantApproval(input.approvalId, input.grantedBy);

  return dependencies.runtime.executeAction({ ...input.request, approvalGrant: grant });
}
