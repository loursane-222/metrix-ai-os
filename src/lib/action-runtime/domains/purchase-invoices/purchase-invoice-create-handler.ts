import { createPurchaseInvoiceFromPurchaseOrder } from "@/lib/core/purchase-invoices/purchase-invoice.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handlePurchaseInvoiceCreate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const purchaseOrderId = requiredString(envelope.input.purchaseOrderId, "purchaseOrderId");
  const supplierInvoiceNumber = requiredString(envelope.input.supplierInvoiceNumber, "supplierInvoiceNumber");
  const goodsReceiptId = optionalString(envelope.input.goodsReceiptId);
  const notes = optionalString(envelope.input.notes);
  const idempotencyKey = optionalString(envelope.input.idempotencyKey);
  const dueDateInput = envelope.input.dueDate;
  if (dueDateInput !== undefined && typeof dueDateInput !== "string") throw new Error("dueDate must be a string.");
  const dueDate = dueDateInput ? new Date(dueDateInput) : undefined;
  if (dueDate && Number.isNaN(dueDate.getTime())) throw new Error("dueDate must be a valid date.");

  // CRITICAL side effect — its failure is the handler's failure.
  const purchaseInvoice = await createPurchaseInvoiceFromPurchaseOrder({
    organizationId: envelope.executionContext.organizationId,
    sourcePurchaseOrderId: purchaseOrderId,
    sourceGoodsReceiptId: goodsReceiptId,
    supplierInvoiceNumber,
    dueDate,
    notes,
    idempotencyKey,
  });

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "purchaseInvoice.created", title: "Alış faturası kaydedildi", body: purchaseInvoice.supplierInvoiceNumber, entityType: "PurchaseInvoice", entityId: purchaseInvoice.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "purchase_invoice", entityId: purchaseInvoice.id },
    resultSummary: "Canonical purchase invoice recorded (DRAFT).",
    metadata: { purchaseInvoiceId: purchaseInvoice.id },
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
