import { findAvailableStockBucket, transferStock } from "@/lib/core/stock/stock.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleStockTransfer(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const productServiceId = requiredString(envelope.input.productServiceId, "productServiceId");
  const fromWarehouseId = requiredString(envelope.input.fromWarehouseId, "fromWarehouseId");
  const toWarehouseId = requiredString(envelope.input.toWarehouseId, "toWarehouseId");
  const quantity = envelope.input.quantity;
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) throw new Error("quantity must be a positive number.");
  const lot = optionalString(envelope.input.lot);
  const batch = optionalString(envelope.input.batch);
  const serialNumber = optionalString(envelope.input.serialNumber);
  const organizationId = envelope.executionContext.organizationId;

  // Read-before-write purely to capture both warehouses' pre-transfer
  // quantities for compensation (see compensation.ts's
  // COMPENSATION_INPUT_BUILDERS for stock.transfer) — a bucket that doesn't
  // exist yet (destination, on a first-ever transfer) has a true "before" of
  // zero, not "nothing to reverse".
  const [fromBefore, toBefore] = await Promise.all([
    findAvailableStockBucket(organizationId, productServiceId, fromWarehouseId, lot, batch, serialNumber),
    findAvailableStockBucket(organizationId, productServiceId, toWarehouseId, lot, batch, serialNumber),
  ]);
  const fromQuantityBefore = fromBefore ? Number(fromBefore.quantity) : 0;
  const toQuantityBefore = toBefore ? Number(toBefore.quantity) : 0;

  // CRITICAL side effect — its failure is the handler's failure.
  const result = await transferStock({
    organizationId,
    productServiceId,
    fromWarehouseId,
    toWarehouseId,
    quantity,
    lot,
    batch,
    serialNumber,
    reason: optionalString(envelope.input.reason),
  });
  if (!result.destination) throw new Error("Stock transfer did not return a destination record.");

  await notifyWithOwnerFanout({ organizationId, actorUserId: envelope.executionContext.actorId, type: "stock.transferred", title: "Depolar arası stok transferi yapıldı", body: `${result.destination.productService.name} — ${quantity} adet: ${result.source?.warehouse.name ?? "?"} → ${result.destination.warehouse.name}`, entityType: "Stock", entityId: result.destination.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "stock", entityId: result.destination.id },
    resultSummary: "Stock transferred between warehouses.",
    metadata: { sourceStockId: result.source?.id, destinationStockId: result.destination.id },
    domainEvents: [],
    sideEffects: [],
    compensationSnapshot: { productServiceId, fromWarehouseId, toWarehouseId, fromQuantityBefore, toQuantityBefore, lot, batch, serialNumber },
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
