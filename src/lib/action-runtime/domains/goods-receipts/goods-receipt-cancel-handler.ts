import { cancelGoodsReceipt } from "@/lib/core/goods-receipts/goods-receipt.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleGoodsReceiptCancel(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const goodsReceiptId = requiredString(envelope.input.goodsReceiptId, "goodsReceiptId");
  const reason = requiredString(envelope.input.reason, "reason");

  // CRITICAL side effect — reverses the physical stock entry via a new
  // compensating RETURN movement; the original RECEIPT movement/record is
  // never deleted or mutated.
  const goodsReceipt = await cancelGoodsReceipt({ goodsReceiptId, organizationId: envelope.executionContext.organizationId, reason });
  if (!goodsReceipt) throw new Error("GoodsReceipt cancellation did not return a record.");

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "goodsReceipt.cancelled", title: "Mal kabul iptal edildi", body: `${goodsReceipt.receiptNumber} — ${reason}`, entityType: "GoodsReceipt", entityId: goodsReceipt.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "goods_receipt", entityId: goodsReceipt.id },
    resultSummary: "GoodsReceipt cancelled; stock reversed.",
    metadata: { goodsReceiptId: goodsReceipt.id },
    domainEvents: [],
    sideEffects: [],
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
