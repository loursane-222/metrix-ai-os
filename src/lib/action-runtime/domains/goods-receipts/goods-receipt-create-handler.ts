import { createGoodsReceiptFromPurchaseOrder } from "@/lib/core/goods-receipts/goods-receipt.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleGoodsReceiptCreate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const purchaseOrderId = requiredString(envelope.input.purchaseOrderId, "purchaseOrderId");
  const warehouseId = requiredString(envelope.input.warehouseId, "warehouseId");
  const notes = optionalString(envelope.input.notes);

  // CRITICAL side effect — its failure is the handler's failure. This is
  // the sole canonical stock-entry authority for Phase 9 (reuses
  // stock.service.ts's receiveStock internally — no parallel stock path).
  const goodsReceipt = await createGoodsReceiptFromPurchaseOrder({
    organizationId: envelope.executionContext.organizationId,
    sourcePurchaseOrderId: purchaseOrderId,
    warehouseId,
    notes,
    performedById: envelope.executionContext.actorId,
  });
  if (!goodsReceipt) throw new Error("GoodsReceipt creation did not return a record.");

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "goodsReceipt.created", title: "Mal kabul kaydedildi", body: goodsReceipt.receiptNumber, entityType: "GoodsReceipt", entityId: goodsReceipt.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "goods_receipt", entityId: goodsReceipt.id },
    resultSummary: "Canonical goods receipt recorded; stock incremented.",
    metadata: { goodsReceiptId: goodsReceipt.id },
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
