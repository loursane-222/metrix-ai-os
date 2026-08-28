import { cancelExecutiveAction, findExecutiveActionByIdForOrganization } from "@/lib/core/executive-actions/executive-action-engine.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionHandler } from "../../execution";

export const executiveActionCancelHandler: ActionHandler = async (envelope) => {
  const executiveActionId = envelope.input.executiveActionId;
  if (typeof executiveActionId !== "string" || !executiveActionId.trim()) throw new Error("executiveActionId is required.");
  const organizationId = envelope.executionContext.organizationId;
  const existing = await findExecutiveActionByIdForOrganization(executiveActionId, organizationId);
  if (!existing) throw new Error("Executive action not found.");
  if (existing.status === "CANCELLED") {
    return { status: "SUCCESS", entityRef: { entityType: "executive_action", entityId: executiveActionId }, resultOutcome: "NO_CHANGE", metadata: { executiveActionId }, domainEvents: [], sideEffects: [] };
  }
  await cancelExecutiveAction({ id: executiveActionId, organizationId });
  await notifyWithOwnerFanout({ organizationId, actorUserId: envelope.executionContext.actorId, type: "executive_action.cancelled", title: "Yönetsel aksiyon iptal edildi", entityType: "ExecutiveAction", entityId: executiveActionId });
  return {
    status: "SUCCESS", entityRef: { entityType: "executive_action", entityId: executiveActionId },
    resultSummary: "executive_action.cancel completed.", metadata: { executiveActionId },
    domainEvents: [], sideEffects: [],
  };
};
