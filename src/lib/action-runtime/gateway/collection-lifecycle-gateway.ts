import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import type { ApprovalGrant } from "../policy";
import { policyEngine } from "../policy";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import { ApprovalRequiredError, PolicyDeniedError } from "../execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest, computeNormalizedInputHash } from "./execution-request";

export type CollectionLifecycleStatus = "IN_PROGRESS" | "DONE" | "DISMISSED";

/**
 * Bkz. customer-archive-gateway.ts / payment-apply-gateway.ts — collection.set_lifecycle
 * için aynı EXPLICIT/HIGH-risk request→confirm→execute approval deseni. Bu,
 * collection.set_lifecycle'ın tek çağrılan yolu olmalıdır — ikinci bir mutation
 * authority oluşturulmadı.
 */
function base(authContext: AuthContext, collectionActionId: string, status: CollectionLifecycleStatus) {
  const input = { collectionActionId, status };
  const entityRef = { entityType: "collection_action", entityId: collectionActionId };
  return {
    input,
    entityRef,
    executionContext: buildExecutionContext(authContext),
    normalizedInputHash: computeNormalizedInputHash({ actionName: "collection.set_lifecycle", input, entityRef }),
  };
}

export async function requestCollectionLifecycleApproval(authContext: AuthContext, collectionActionId: string, status: CollectionLifecycleStatus) {
  const candidate = base(authContext, collectionActionId, status);
  const decision = await policyEngine.evaluatePolicy({
    actionName: "collection.set_lifecycle",
    actorContext: candidate.executionContext,
    targetEntityRef: candidate.entityRef,
    normalizedInputHash: candidate.normalizedInputHash,
  });
  if (decision.outcome === "DENY") throw new PolicyDeniedError("collection.set_lifecycle", decision.reasonCode);
  if (!decision.approvalRequest) throw new Error("APPROVAL_NOT_CREATED");
  return decision.approvalRequest;
}

export async function cancelCollectionLifecycleApproval(authContext: AuthContext, approvalId: string) {
  const request = await policyEngine.getApprovalRequest(approvalId);
  if (
    request.actorId !== authContext.user.id ||
    request.organizationId !== authContext.organization.id ||
    request.actionName !== "collection.set_lifecycle"
  ) {
    throw new Error("APPROVAL_NOT_FOUND");
  }
  await policyEngine.revokeApproval(approvalId, authContext.user.id);
}

export async function executeApprovedCollectionLifecycle(input: {
  authContext: AuthContext;
  collectionActionId: string;
  status: CollectionLifecycleStatus;
  approvalId: string;
  idempotencyKey: string;
  correlationId: string;
}) {
  const candidate = base(input.authContext, input.collectionActionId, input.status);
  const approval = await policyEngine.getApprovalRequest(input.approvalId);
  if (
    approval.actionName !== "collection.set_lifecycle" ||
    approval.actorId !== candidate.executionContext.actorId ||
    approval.organizationId !== candidate.executionContext.organizationId ||
    approval.targetEntityRef?.entityType !== candidate.entityRef.entityType ||
    approval.targetEntityRef.entityId !== candidate.entityRef.entityId ||
    approval.normalizedInputHash !== candidate.normalizedInputHash
  ) {
    throw new ApprovalRequiredError("collection.set_lifecycle", "APPROVAL_CONTEXT_MISMATCH");
  }
  const grant: ApprovalGrant = approval.status === "GRANTED"
    ? await policyEngine.getApprovalGrant(input.approvalId)
    : await policyEngine.grantApproval(input.approvalId, input.authContext.user.id);
  return productionExecutionRuntime.executeAction(
    buildActionExecutionRequest({
      actionName: "collection.set_lifecycle",
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
