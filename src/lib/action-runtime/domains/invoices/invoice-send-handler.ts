import { sendInvoice } from "@/lib/core/invoices/invoice.service";
import type { ActionHandler } from "../../execution";

/** Internal DRAFT -> SENT transition only; no e-Fatura or external delivery. */
export const invoiceSendHandler: ActionHandler = async (envelope) => {
  const invoiceId = envelope.input.invoiceId;
  if (typeof invoiceId !== "string" || !invoiceId.trim()) throw new Error("invoiceId is required.");

  const invoice = await sendInvoice({
    invoiceId: invoiceId.trim(),
    organizationId: envelope.executionContext.organizationId,
  });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "invoice", entityId: invoice.id },
    resultSummary: "invoice.send completed.",
    metadata: { invoiceId: invoice.id, changedFields: ["status"] },
    domainEvents: [],
    sideEffects: [],
  };
};
