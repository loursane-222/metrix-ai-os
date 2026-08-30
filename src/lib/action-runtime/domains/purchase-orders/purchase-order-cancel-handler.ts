import { cancelPurchaseOrder } from "@/lib/core/purchase-orders/purchase-order.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handlePurchaseOrderCancel(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const purchaseOrderId = requiredString(envelope.input.purchaseOrderId, "purchaseOrderId");
  const reason = requiredString(envelope.input.reason, "reason");

  // CRITICAL side effect — its failure is the handler's failure.
  const purchaseOrder = await cancelPurchaseOrder({ purchaseOrderId, organizationId: envelope.executionContext.organizationId, reason });
  if (!purchaseOrder) throw new Error("PurchaseOrder cancellation did not return a record.");

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "purchaseOrder.cancelled", title: "Satın alma siparişi iptal edildi", body: `${purchaseOrder.poNumber} — ${reason}`, entityType: "PurchaseOrder", entityId: purchaseOrder.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "purchase_order", entityId: purchaseOrder.id },
    resultSummary: "PurchaseOrder cancelled.",
    metadata: { purchaseOrderId: purchaseOrder.id },
    domainEvents: [],
    sideEffects: [],
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
