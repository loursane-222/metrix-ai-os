import { resolveAndDispatchInvoiceEditSurfaceCommand } from "@/lib/invoices/invoice-edit-command-integration";
import { getActiveInvoiceEditSurfaceDescriptor } from "@/lib/invoices/invoice-edit-surface-command-channel";
import type { ConversationExtension } from "./conversation-extension-contract";
import { invoiceHandoff } from "./conversation-extension-handoff";

export const invoiceEditConversationExtension: ConversationExtension = {
  getActiveScopeKey() { const descriptor = getActiveInvoiceEditSurfaceDescriptor(); return descriptor ? `invoice-edit:${descriptor.token}:${descriptor.entityId}` : null; },
  async execute(utterance) {
    let result: Awaited<ReturnType<typeof resolveAndDispatchInvoiceEditSurfaceCommand>>;
    try { result = await resolveAndDispatchInvoiceEditSurfaceCommand(utterance); } catch (error) { return { status: "HANDOFF", handoff: invoiceHandoff({ operation: "UPDATE", outcomeCode: "INVOICE_EDIT_EXECUTION_FAILED", resultStatus: "FAILED", failureCode: error instanceof Error ? error.message : "INVOICE_EDIT_EXECUTION_FAILED" }) }; }
    if (!result || result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") return { status: "NOT_HANDLED", handoff: null };
    if (result.status === "EXECUTED") return { status: "HANDOFF", handoff: invoiceHandoff({ operation: "UPDATE", outcomeCode: "INVOICE_EDIT_EXECUTED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", mutationPerformed: true }) };
    if (result.status === "CLARIFICATION_REQUIRED") return { status: "HANDOFF", handoff: invoiceHandoff({ operation: "UPDATE", outcomeCode: "INVOICE_EDIT_CLARIFICATION_REQUIRED", resultStatus: "CLARIFICATION_REQUIRED" }) };
    return { status: "HANDOFF", handoff: invoiceHandoff({ operation: "UPDATE", outcomeCode: "INVOICE_EDIT_FAILED", resultStatus: "FAILED", failureCode: `INVOICE_EDIT_${result.status}` }) };
  },
};
