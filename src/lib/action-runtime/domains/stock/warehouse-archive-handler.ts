import { archiveWarehouseById, getWarehouseByIdForOrganization } from "@/lib/core/stock/stock.service";
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
  return {
    status: "SUCCESS", entityRef: { entityType: "warehouse", entityId: warehouseId },
    resultSummary: "warehouse.archive completed.", metadata: { warehouseId },
    domainEvents: [], sideEffects: [],
  };
};
