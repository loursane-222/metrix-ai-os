import { findInvoiceById, voidInvoice } from "@/lib/core/invoices/invoice.service";
import type { ActionHandler } from "../../execution";

export const invoiceVoidHandler: ActionHandler = async (envelope) => {
  const invoiceId = envelope.input.invoiceId;
  if (typeof invoiceId !== "string" || !invoiceId.trim()) throw new Error("invoiceId is required.");
  const organizationId = envelope.executionContext.organizationId;
  const existing = await findInvoiceById(invoiceId, organizationId);
  if (!existing) throw new Error("Invoice not found.");
  if (existing.status === "CANCELLED") {
    return { status: "SUCCESS", entityRef: { entityType: "invoice", entityId: invoiceId }, resultOutcome: "NO_CHANGE", metadata: { invoiceId }, domainEvents: [], sideEffects: [] };
  }
  await voidInvoice({ invoiceId, organizationId });
  return {
    status: "SUCCESS", entityRef: { entityType: "invoice", entityId: invoiceId },
    resultSummary: "invoice.void completed.", metadata: { invoiceId },
    domainEvents: [], sideEffects: [],
  };
};
