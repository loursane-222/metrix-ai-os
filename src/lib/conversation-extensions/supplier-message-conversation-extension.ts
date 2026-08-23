import type { ConversationExtension } from "./conversation-extension-contract";
import { communicationHandoff } from "./conversation-extension-handoff";
import { listSuppliers } from "@/lib/suppliers/suppliers-client";
import { resolveSupplierReference } from "@/lib/suppliers/supplier-resolution";
import { requestSupplierMessage } from "@/lib/executive-communication/supplier-message-client";

// "Vega Metal'e mesaj gönder: Siparişin teslim tarihini onaylar mısınız?" —
// unlike sendPaymentReminder (content auto-composed from canonical
// evidence), the message body here is the user's own dictated words,
// captured verbatim after the colon — METRIX never invents or embellishes
// what gets said to the supplier, only resolves who it goes to and
// delivers it. Any possessive suffix on the supplier's name ('e/'a/'ye/...)
// is stripped before resolution, matching payment-reminder-conversation-
// extension.ts's WhatsApp statement pattern.
const SUPPLIER_MESSAGE_PATTERN = /^([\s\S]+?)(?:['’][a-zçğıöşü]+)?\s+(?:(?:şu\s+)?mesaj[ıi]?)\s+g[öo]nder\s*[:：]\s*([\s\S]+)$/iu;

async function resolveSupplier(reference: string) {
  const response = await listSuppliers();
  if (!response.ok) return { error: response.error } as const;
  return { resolution: resolveSupplierReference(response.data.suppliers, reference) } as const;
}

function stripSurroundingQuotes(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^['"“”]([\s\S]*)['"“”]$/u);
  return (match ? match[1]! : trimmed).trim();
}

export const supplierMessageConversationExtension: ConversationExtension = {
  getActiveScopeKey() { return typeof window === "undefined" ? null : `supplier-message:${window.location.pathname}`; },
  async execute(utterance) {
    const match = utterance.trim().match(SUPPLIER_MESSAGE_PATTERN);
    if (!match) return { status: "NOT_HANDLED", handoff: null };

    const messageBody = stripSurroundingQuotes(match[2]!);
    if (!messageBody) return { status: "HANDOFF", handoff: communicationHandoff({ operation: "CREATE", outcomeCode: "SUPPLIER_MESSAGE_BODY_MISSING", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_REQUIRED" }) };

    const found = await resolveSupplier(match[1]!.trim());
    if ("error" in found) return { status: "HANDOFF", handoff: communicationHandoff({ operation: "CREATE", outcomeCode: "SUPPLIER_MESSAGE_LOOKUP_FAILED", resultStatus: "FAILED" }) };
    if (found.resolution.status === "NOT_FOUND") return { status: "HANDOFF", handoff: communicationHandoff({ operation: "CREATE", outcomeCode: "SUPPLIER_MESSAGE_SUPPLIER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
    if (found.resolution.status === "AMBIGUOUS") return { status: "HANDOFF", handoff: communicationHandoff({ operation: "CREATE", outcomeCode: "SUPPLIER_MESSAGE_SUPPLIER_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: found.resolution.options.map((option) => option.displayName) }) };

    const supplier = found.resolution.supplier;
    const outcome = await requestSupplierMessage({ supplierId: supplier.id, messageBody });

    if (outcome.outcome === "SUPPLIER_NOT_FOUND") return { status: "HANDOFF", handoff: communicationHandoff({ operation: "CREATE", outcomeCode: "SUPPLIER_MESSAGE_SUPPLIER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
    if (outcome.outcome === "MISSING_RECIPIENT_EMAIL") return { status: "HANDOFF", handoff: communicationHandoff({ operation: "CREATE", outcomeCode: "SUPPLIER_MESSAGE_EMAIL_MISSING", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "RESOLVED", candidateNames: [supplier.displayName] }) };
    if (outcome.outcome === "PROVIDER_FAILED" || outcome.outcome === "REQUEST_FAILED") {
      return { status: "HANDOFF", handoff: communicationHandoff({ operation: "CREATE", outcomeCode: "SUPPLIER_MESSAGE_SEND_FAILED", resultStatus: "FAILED", entityResolution: "RESOLVED", candidateNames: [supplier.displayName] }) };
    }

    // resultStatus EXECUTED + mutationPerformed already produces an
    // accurate deterministic confirmation ("İşlemi tamamladım.") — no
    // custom prompt guidance needed, same as payment reminder's SENT branch.
    return {
      status: "HANDOFF",
      handoff: communicationHandoff({ operation: "CREATE", outcomeCode: "SUPPLIER_MESSAGE_SENT", resultStatus: "EXECUTED", entityResolution: "RESOLVED", candidateNames: [supplier.displayName], mutationPerformed: true }),
    };
  },
};
