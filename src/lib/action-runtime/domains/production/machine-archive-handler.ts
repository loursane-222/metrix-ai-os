import { getMachineByIdForOrganization, updateMachineDetails } from "@/lib/core/production/production.service";
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
  return {
    status: "SUCCESS", entityRef: { entityType: "machine", entityId: machineId },
    resultSummary: "machine.archive completed.", metadata: { machineId },
    domainEvents: [], sideEffects: [],
  };
};
