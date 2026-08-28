import { getWorkCenterByIdForOrganization, updateWorkCenterDetails } from "@/lib/core/production/production.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionHandler } from "../../execution";

export const workCenterArchiveHandler: ActionHandler = async (envelope) => {
  const workCenterId = envelope.input.workCenterId;
  if (typeof workCenterId !== "string" || !workCenterId.trim()) throw new Error("workCenterId is required.");
  const organizationId = envelope.executionContext.organizationId;
  const existing = await getWorkCenterByIdForOrganization(workCenterId, organizationId);
  if (!existing) throw new Error("Work center not found.");
  if (existing.status === "INACTIVE") {
    return { status: "SUCCESS", entityRef: { entityType: "workCenter", entityId: workCenterId }, resultOutcome: "NO_CHANGE", metadata: { workCenterId }, domainEvents: [], sideEffects: [] };
  }
  await updateWorkCenterDetails({ id: workCenterId, organizationId, status: "INACTIVE" });
  await notifyWithOwnerFanout({ organizationId, actorUserId: envelope.executionContext.actorId, type: "work_center.archived", title: "İş merkezi devre dışı bırakıldı", body: existing.name, entityType: "WorkCenter", entityId: workCenterId });
  return {
    status: "SUCCESS", entityRef: { entityType: "workCenter", entityId: workCenterId },
    resultSummary: "workCenter.archive completed.", metadata: { workCenterId },
    domainEvents: [], sideEffects: [],
  };
};
