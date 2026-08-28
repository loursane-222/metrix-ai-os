import { archiveWarehouseById, getWarehouseByIdForOrganization } from "@/lib/core/stock/stock.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionHandler } from "../../execution";

export const warehouseArchiveHandler: ActionHandler = async (envelope) => {
  const warehouseId = envelope.input.warehouseId;
  if (typeof warehouseId !== "string" || !warehouseId.trim()) throw new Error("warehouseId is required.");
  const organizationId = envelope.executionContext.organizationId;
  const existing = await getWarehouseByIdForOrganization(warehouseId, organizationId);
  if (!existing) throw new Error("Warehouse not found.");
  if (existing.status === "ARCHIVED") {
    return { status: "SUCCESS", entityRef: { entityType: "warehouse", entityId: warehouseId }, resultOutcome: "NO_CHANGE", metadata: { warehouseId }, domainEvents: [], sideEffects: [] };
  }
  await archiveWarehouseById(warehouseId, organizationId);
  await notifyWithOwnerFanout({ organizationId, actorUserId: envelope.executionContext.actorId, type: "warehouse.archived", title: "Depo pasife alındı", body: existing.name, entityType: "Warehouse", entityId: warehouseId });
  return {
    status: "SUCCESS", entityRef: { entityType: "warehouse", entityId: warehouseId },
    resultSummary: "warehouse.archive completed.", metadata: { warehouseId },
    domainEvents: [], sideEffects: [],
  };
};
