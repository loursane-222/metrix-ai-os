import { getMachineByIdForOrganization, updateMachineDetails } from "@/lib/core/production/production.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionHandler } from "../../execution";

export const machineArchiveHandler: ActionHandler = async (envelope) => {
  const machineId = envelope.input.machineId;
  if (typeof machineId !== "string" || !machineId.trim()) throw new Error("machineId is required.");
  const organizationId = envelope.executionContext.organizationId;
  const existing = await getMachineByIdForOrganization(machineId, organizationId);
  if (!existing) throw new Error("Machine not found.");
  if (existing.status === "RETIRED") {
    return { status: "SUCCESS", entityRef: { entityType: "machine", entityId: machineId }, resultOutcome: "NO_CHANGE", metadata: { machineId }, domainEvents: [], sideEffects: [] };
  }
  await updateMachineDetails({ id: machineId, organizationId, status: "RETIRED" });
  await notifyWithOwnerFanout({ organizationId, actorUserId: envelope.executionContext.actorId, type: "machine.archived", title: "Makine devre dışı bırakıldı", body: existing.name, entityType: "Machine", entityId: machineId });
  return {
    status: "SUCCESS", entityRef: { entityType: "machine", entityId: machineId },
    resultSummary: "machine.archive completed.", metadata: { machineId },
    domainEvents: [], sideEffects: [],
  };
};
