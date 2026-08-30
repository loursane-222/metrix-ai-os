import { voidPurchaseInvoice } from "@/lib/core/purchase-invoices/purchase-invoice.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handlePurchaseInvoiceVoid(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const purchaseInvoiceId = requiredString(envelope.input.purchaseInvoiceId, "purchaseInvoiceId");

  // CRITICAL side effect — only a DRAFT (never-confirmed, no ledger
  // recognition yet) purchase invoice can be voided.
  const purchaseInvoice = await voidPurchaseInvoice({ purchaseInvoiceId, organizationId: envelope.executionContext.organizationId });

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "purchaseInvoice.voided", title: "Alış faturası iptal edildi", body: purchaseInvoice.supplierInvoiceNumber, entityType: "PurchaseInvoice", entityId: purchaseInvoice.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "purchase_invoice", entityId: purchaseInvoice.id },
    resultSummary: "PurchaseInvoice voided.",
    metadata: { purchaseInvoiceId: purchaseInvoice.id },
    domainEvents: [],
    sideEffects: [],
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
