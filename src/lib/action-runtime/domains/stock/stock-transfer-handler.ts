import { transferStock } from "@/lib/core/stock/stock.service";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleStockTransfer(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const productServiceId = requiredString(envelope.input.productServiceId, "productServiceId");
  const fromWarehouseId = requiredString(envelope.input.fromWarehouseId, "fromWarehouseId");
  const toWarehouseId = requiredString(envelope.input.toWarehouseId, "toWarehouseId");
  const quantity = envelope.input.quantity;
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) throw new Error("quantity must be a positive number.");

  // CRITICAL side effect — its failure is the handler's failure.
  const result = await transferStock({
    organizationId: envelope.executionContext.organizationId,
    productServiceId,
    fromWarehouseId,
    toWarehouseId,
    quantity,
    lot: optionalString(envelope.input.lot),
    batch: optionalString(envelope.input.batch),
    serialNumber: optionalString(envelope.input.serialNumber),
    reason: optionalString(envelope.input.reason),
  });
  if (!result.destination) throw new Error("Stock transfer did not return a destination record.");

  return {
    status: "SUCCESS",
    entityRef: { entityType: "stock", entityId: result.destination.id },
    resultSummary: "Stock transferred between warehouses.",
    metadata: { sourceStockId: result.source?.id, destinationStockId: result.destination.id },
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
