import { receiveStock } from "@/lib/core/stock/stock.service";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleStockReceive(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const productServiceId = requiredString(envelope.input.productServiceId, "productServiceId");
  const warehouseId = requiredString(envelope.input.warehouseId, "warehouseId");
  const quantity = envelope.input.quantity;
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) throw new Error("quantity must be a positive number.");

  // CRITICAL side effect — its failure is the handler's failure.
  const stock = await receiveStock({
    organizationId: envelope.executionContext.organizationId,
    productServiceId,
    warehouseId,
    quantity,
    lot: optionalString(envelope.input.lot),
    batch: optionalString(envelope.input.batch),
    serialNumber: optionalString(envelope.input.serialNumber),
    location: optionalString(envelope.input.location),
  });
  if (!stock) throw new Error("Stock receipt did not return a record.");

  return {
    status: "SUCCESS",
    entityRef: { entityType: "stock", entityId: stock.id },
    resultSummary: "Canonical stock received.",
    metadata: { stockId: stock.id },
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
