import { adjustStockQuantity, findAvailableStockBucket } from "@/lib/core/stock/stock.service";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

const AUTO_COMPENSATION_REASON = "Orkestrasyon adımı başarısız oldu; bu düzeltme otomatik olarak geri alındı.";

export async function handleStockAdjustment(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const productServiceId = requiredString(envelope.input.productServiceId, "productServiceId");
  const warehouseId = requiredString(envelope.input.warehouseId, "warehouseId");
  const countedQuantity = envelope.input.countedQuantity;
  if (typeof countedQuantity !== "number" || !Number.isFinite(countedQuantity) || countedQuantity < 0) throw new Error("countedQuantity must be a non-negative number.");
  const lot = optionalString(envelope.input.lot);
  const batch = optionalString(envelope.input.batch);
  const serialNumber = optionalString(envelope.input.serialNumber);
  const organizationId = envelope.executionContext.organizationId;

  // Read-before-write purely to capture the pre-adjustment quantity for
  // compensation — adjustStockQuantity itself already re-resolves the same
  // bucket inside its own transaction.
  const before = await findAvailableStockBucket(organizationId, productServiceId, warehouseId, lot, batch, serialNumber);
  const quantityBefore = before ? Number(before.quantity) : null;

  // CRITICAL side effect — its failure is the handler's failure.
  const stock = await adjustStockQuantity({
    organizationId,
    productServiceId,
    warehouseId,
    countedQuantity,
    lot,
    batch,
    serialNumber,
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
    compensationSnapshot: quantityBefore === null || quantityBefore === countedQuantity
      ? undefined
      : { productServiceId, warehouseId, countedQuantity: quantityBefore, lot, batch, serialNumber, reason: AUTO_COMPENSATION_REASON },
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
