import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { ApiValidationError } from "@/lib/api/validation";
import { policyEngine, type ApprovalRequest, type PolicyEngine } from "@/lib/action-runtime/policy";
import type { ApprovalLifecycleEnvelope } from "./executive-lifecycle.types";
import { executiveLifecycleRegistry } from "./executive-lifecycle-registry";

export type ApprovalDecisionRequest = Readonly<{
  approvalId: string;
  decision: "approve" | "reject";
  reason?: string;
}>;

export function approvalRequestEnvelope(request: ApprovalRequest, phase: ApprovalLifecycleEnvelope["phase"] = "awaiting_decision"): ApprovalLifecycleEnvelope {
  const status = request.status === "PENDING" ? "waiting"
    : request.status === "EXPIRED" ? "expired"
      : request.status === "REVOKED" ? "cancelled" : "succeeded";
  const envelope: ApprovalLifecycleEnvelope = Object.freeze({
    envelopeId: `approval:${request.approvalId}:${request.status}`,
    source: "approval",
    phase,
    status,
    timestamp: Date.now(),
    correlationId: request.approvalId,
    sessionId: request.approvalId,
    organizationId: request.organizationId,
    actorId: request.actorId,
    entityType: request.targetEntityRef?.entityType,
    entityId: request.targetEntityRef?.entityId,
    actionKey: request.actionName,
    target: request.targetEntityRef ? {
      executiveTargetId: `${request.targetEntityRef.entityType}:${request.targetEntityRef.entityId}`,
      ...request.targetEntityRef,
    } : undefined,
    summary: `${request.actionName} için onay bekleniyor`,
    recoverability: "user_action",
    outcome: status === "expired" ? "expired" : status === "cancelled" ? "rejected" : undefined,
    approval: {
      approvalId: request.approvalId,
      actionName: request.actionName,
      expiresAt: request.expiresAt,
      currentStatus: request.status,
    },
  });
  executiveLifecycleRegistry.publish(envelope);
  return envelope;
}

export function listApprovalEnvelopes(auth: AuthContext, engine: PolicyEngine = policyEngine): ApprovalLifecycleEnvelope[] {
  return engine.listApprovalRequests(auth.user.id, auth.organization.id)
    .filter((request) => request.status === "PENDING" || request.status === "EXPIRED")
    .map((request) => approvalRequestEnvelope(request, request.status === "EXPIRED" ? "expired" : "awaiting_decision"));
}

export function decideApproval(
  auth: AuthContext,
  input: ApprovalDecisionRequest,
  engine: PolicyEngine = policyEngine,
): ApprovalLifecycleEnvelope {
  let approval: ApprovalRequest;
  try {
    approval = engine.getApprovalRequest(input.approvalId);
  } catch {
    throw new ApiValidationError("Approval not found.", 404);
  }
  if (approval.actorId !== auth.user.id || approval.organizationId !== auth.organization.id) {
    throw new ApiValidationError("Approval decision is not authorized.", 403);
  }
  if (approval.status !== "PENDING") {
    throw new ApiValidationError(`Approval is already ${approval.status.toLowerCase()}.`, 409);
  }

  try {
    if (input.decision === "approve") engine.grantApproval(approval.approvalId, auth.user.id);
    else engine.revokeApproval(approval.approvalId);
  } catch {
    const current = engine.getApprovalRequest(approval.approvalId);
    if (current.status === "EXPIRED") throw new ApiValidationError("Approval has expired.", 409);
    throw new ApiValidationError("Approval could not be resolved.", 409);
  }

  const current = engine.getApprovalRequest(approval.approvalId);
  const approved = current.status === "GRANTED";
  return Object.freeze({
    ...approvalRequestEnvelope(current, approved ? "approved" : "rejected"),
    envelopeId: `approval:${current.approvalId}:${current.status}`,
    status: approved ? "succeeded" : "cancelled",
    summary: approved ? `${current.actionName} onaylandı` : `${current.actionName} reddedildi`,
    outcome: approved ? "succeeded" : "rejected",
    detail: input.reason,
  });
}
