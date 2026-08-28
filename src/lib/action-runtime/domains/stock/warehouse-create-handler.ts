import { createNewWarehouse } from "@/lib/core/stock/stock.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleWarehouseCreate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const name = requiredString(envelope.input.name, "name");
  const code = requiredString(envelope.input.code, "code");

  // CRITICAL side effect — its failure is the handler's failure.
  const warehouse = await createNewWarehouse({
    organizationId: envelope.executionContext.organizationId,
    name,
    code,
    type: optionalString(envelope.input.type),
    address: optionalString(envelope.input.address),
    notes: optionalString(envelope.input.notes),
  });
  if (!warehouse) throw new Error("Warehouse creation did not return a record.");

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "warehouse.created", title: "Yeni depo oluşturuldu", body: warehouse.name, entityType: "Warehouse", entityId: warehouse.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "warehouse", entityId: warehouse.id },
    resultSummary: "Warehouse created.",
    metadata: { warehouseId: warehouse.id },
    domainEvents: [],
    sideEffects: [],
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
