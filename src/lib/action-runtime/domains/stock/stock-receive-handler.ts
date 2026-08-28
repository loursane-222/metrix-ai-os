import { findAvailableStockBucket, receiveStock } from "@/lib/core/stock/stock.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleStockReceive(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const productServiceId = requiredString(envelope.input.productServiceId, "productServiceId");
  const warehouseId = requiredString(envelope.input.warehouseId, "warehouseId");
  const quantity = envelope.input.quantity;
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) throw new Error("quantity must be a positive number.");
  const lot = optionalString(envelope.input.lot);
  const batch = optionalString(envelope.input.batch);
  const serialNumber = optionalString(envelope.input.serialNumber);
  const organizationId = envelope.executionContext.organizationId;

  // Read-before-write purely to capture the pre-receive quantity for
  // compensation (see compensation.ts's COMPENSATION_INPUT_BUILDERS for
  // stock.receive) — no bucket yet means the true "before" is zero, not
  // "nothing to reverse": receiveStock is about to create one.
  const before = await findAvailableStockBucket(organizationId, productServiceId, warehouseId, lot, batch, serialNumber);
  const quantityBefore = before ? Number(before.quantity) : 0;

  // CRITICAL side effect — its failure is the handler's failure.
  const stock = await receiveStock({
    organizationId,
    productServiceId,
    warehouseId,
    quantity,
    lot,
    batch,
    serialNumber,
    location: optionalString(envelope.input.location),
  });
  if (!stock) throw new Error("Stock receipt did not return a record.");

  await notifyWithOwnerFanout({ organizationId, actorUserId: envelope.executionContext.actorId, type: "stock.received", title: "Stok girişi yapıldı", body: `${stock.productService.name} — ${quantity} adet (${stock.warehouse.name})`, entityType: "Stock", entityId: stock.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "stock", entityId: stock.id },
    resultSummary: "Canonical stock received.",
    metadata: { stockId: stock.id },
    domainEvents: [],
    sideEffects: [],
    compensationSnapshot: { productServiceId, warehouseId, quantityBefore, lot, batch, serialNumber },
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
