import { adjustStockQuantity } from "@/lib/core/stock/stock.service";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleStockAdjustment(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const productServiceId = requiredString(envelope.input.productServiceId, "productServiceId");
  const warehouseId = requiredString(envelope.input.warehouseId, "warehouseId");
  const countedQuantity = envelope.input.countedQuantity;
  if (typeof countedQuantity !== "number" || !Number.isFinite(countedQuantity) || countedQuantity < 0) throw new Error("countedQuantity must be a non-negative number.");

  // CRITICAL side effect — its failure is the handler's failure.
  const stock = await adjustStockQuantity({
    organizationId: envelope.executionContext.organizationId,
    productServiceId,
    warehouseId,
    countedQuantity,
    lot: optionalString(envelope.input.lot),
    batch: optionalString(envelope.input.batch),
    serialNumber: optionalString(envelope.input.serialNumber),
    reason: optionalString(envelope.input.reason),
  });
  if (!stock) throw new Error("Stock adjustment did not return a record.");

  return {
    status: "SUCCESS",
    entityRef: { entityType: "stock", entityId: stock.id },
    resultSummary: "Stock quantity adjusted to physical count.",
    metadata: { stockId: stock.id, countedQuantity },
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
