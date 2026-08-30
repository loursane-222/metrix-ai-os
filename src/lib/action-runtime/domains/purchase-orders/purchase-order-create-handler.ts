import { createNewPurchaseOrder } from "@/lib/core/purchase-orders/purchase-order.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handlePurchaseOrderCreate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const supplierId = requiredString(envelope.input.supplierId, "supplierId");
  const currency = optionalString(envelope.input.currency);
  const notes = optionalString(envelope.input.notes);
  const expectedDeliveryDateInput = envelope.input.expectedDeliveryDate;
  if (expectedDeliveryDateInput !== undefined && typeof expectedDeliveryDateInput !== "string") throw new Error("expectedDeliveryDate must be a string.");
  const expectedDeliveryDate = expectedDeliveryDateInput ? new Date(expectedDeliveryDateInput) : undefined;
  if (expectedDeliveryDate && Number.isNaN(expectedDeliveryDate.getTime())) throw new Error("expectedDeliveryDate must be a valid date.");

  // CRITICAL side effect — its failure is the handler's failure.
  const purchaseOrder = await createNewPurchaseOrder({
    organizationId: envelope.executionContext.organizationId,
    supplierId,
    currency,
    notes,
    expectedDeliveryDate,
    createdByUserId: envelope.executionContext.actorId,
  });
  if (!purchaseOrder) throw new Error("PurchaseOrder creation did not return a record.");

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "purchaseOrder.created", title: "Yeni satın alma siparişi oluşturuldu", body: purchaseOrder.poNumber, entityType: "PurchaseOrder", entityId: purchaseOrder.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "purchase_order", entityId: purchaseOrder.id },
    resultSummary: "Canonical purchase order created.",
    metadata: { purchaseOrderId: purchaseOrder.id },
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
