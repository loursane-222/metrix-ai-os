import type { ConversationExtension } from "./conversation-extension-contract";
import { communicationHandoff } from "./conversation-extension-handoff";
import { requestPaymentReminder } from "@/lib/executive-communication/executive-communication-client";
import { listCustomers } from "@/lib/customers/customers-client";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { whatsappNumber } from "./offer-management-conversation-extension";

// Cheap keyword gate before spending an LLM call + a real outbound email —
// avoids firing the trigger resolver on utterances that obviously aren't
// this request (e.g. "tahsilat listesini göster").
const BALANCE_STEM = /tahsilat|ödeme/iu;
const REMINDER_STEM = /hat[ıi]rlat/iu;
const SEND_STEM = /g[öo]nder/iu;

// "Atlas Insaat'a ekstre gönder" / "...whatsap'tan mutabakat gönder" /
// "...hesap özetini whatsapptan gönder" — same wa.me compose-and-let-the-
// user-press-send pattern as offer-management-conversation-extension.ts's
// quote WhatsApp send (see whatsappNumber there), applied to the customer's
// live account statement instead of a quote. No WhatsApp Business API
// account needed — this only opens WhatsApp (mobile or Web/Desktop) with a
// ready-made message; METRIX never sends the message itself.
const WHATSAPP_STATEMENT_PATTERN = /^(.+?)(?:['’][a-zçğıöşü]+)?\s+(?:(?:whatsapp|whatsap)(?:'|’)?(?:tan|dan)\s+)?(?:ekstre(?:sini)?|mutabakat(?:\s+talebi)?|hesap\s+özeti(?:ni)?)\s+(?:(?:whatsapp|whatsap)(?:'|’)?(?:tan|dan)\s+)?g[öo]nder[.!]?$/iu;

async function resolveCustomer(reference: string) {
  const response = await listCustomers();
  if (!response.ok) return { error: response.error } as const;
  return { resolution: resolveCustomerReference(response.data.customers, reference) } as const;
}

function formatBalances(balances: readonly { currency: string; balanceCents: string }[]): string {
  if (balances.length === 0) return "güncel açık bakiyeniz bulunmuyor";
  return balances
    .map((balance) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: balance.currency }).format(Number(balance.balanceCents) / 100))
    .join(", ");
}

export const paymentReminderConversationExtension: ConversationExtension = {
  // Not surface-scoped (works from any page, like customer-management's
  // deictic commands) — must still return a non-null key so
  // executeActiveConversationExtension's `getActiveScopeKey() !== null`
  // filter includes it in the active set; unconditional null is treated as
  // "never active" and would silently exclude this extension entirely.
  getActiveScopeKey() { return typeof window === "undefined" ? null : `payment-reminder:${window.location.pathname}`; },
  async execute(utterance) {
    const text = utterance.trim();

    const statementMatch = text.match(WHATSAPP_STATEMENT_PATTERN);
    if (statementMatch) {
      const found = await resolveCustomer(statementMatch[1]!.trim());
      if ("error" in found) return { status: "HANDOFF", handoff: communicationHandoff({ operation: "QUERY", outcomeCode: "PAYMENT_REMINDER_WHATSAPP_LOOKUP_FAILED", resultStatus: "FAILED" }) };
      if (found.resolution.status === "NOT_FOUND") return { status: "HANDOFF", handoff: communicationHandoff({ operation: "QUERY", outcomeCode: "PAYMENT_REMINDER_WHATSAPP_CUSTOMER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
      if (found.resolution.status === "AMBIGUOUS") return { status: "HANDOFF", handoff: communicationHandoff({ operation: "QUERY", outcomeCode: "PAYMENT_REMINDER_WHATSAPP_CUSTOMER_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: found.resolution.options.map((option) => option.displayName) }) };

      const customer = found.resolution.customer;
      const phone = customer.phone ? whatsappNumber(customer.phone) : "";
      if (!phone) return { status: "HANDOFF", handoff: communicationHandoff({ operation: "QUERY", outcomeCode: "PAYMENT_REMINDER_WHATSAPP_PHONE_MISSING", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "RESOLVED", candidateNames: [customer.displayName] }) };

      const response = await fetch(`/api/customers/${encodeURIComponent(customer.id)}/statement-public-link`, { method: "POST", credentials: "include" });
      const payload = await response.json() as { ok?: boolean; data?: { publicUrl?: string; organizationName?: string; balances?: readonly { currency: string; balanceCents: string }[] } };
      if (!response.ok || !payload.ok || !payload.data?.publicUrl || !payload.data.organizationName) {
        return { status: "HANDOFF", handoff: communicationHandoff({ operation: "QUERY", outcomeCode: "PAYMENT_REMINDER_WHATSAPP_LINK_FAILED", resultStatus: "FAILED", entityResolution: "RESOLVED", failureCode: "STATEMENT_PUBLIC_LINK_FAILED" }) };
      }

      const message = `${payload.data.organizationName} — hesap ekstrenizi mutabakat için paylaşıyoruz (${formatBalances(payload.data.balances ?? [])}): ${payload.data.publicUrl}`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
      return { status: "HANDOFF", handoff: communicationHandoff({ operation: "QUERY", outcomeCode: "PAYMENT_REMINDER_WHATSAPP_STATEMENT_READY", resultStatus: "EXECUTED", entityResolution: "RESOLVED", candidateNames: [customer.displayName], mutationPerformed: true }) };
    }

    if (!BALANCE_STEM.test(text) || !REMINDER_STEM.test(text) || !SEND_STEM.test(text)) {
      return { status: "NOT_HANDLED", handoff: null };
    }

    const outcome = await requestPaymentReminder(text);

    if (outcome.status === "NOT_HANDLED") return { status: "NOT_HANDLED", handoff: null };

    if (outcome.status === "CLARIFICATION_NEEDED") {
      return {
        status: "HANDOFF",
        handoff: communicationHandoff({
          operation: "QUERY",
          outcomeCode: "PAYMENT_REMINDER_CLARIFICATION_NEEDED",
          resultStatus: "CLARIFICATION_REQUIRED",
          entityResolution: outcome.candidateNames.length > 0 ? "AMBIGUOUS" : "NOT_FOUND",
          candidateNames: outcome.candidateNames,
        }),
      };
    }

    if (outcome.status === "NO_OUTSTANDING_BALANCE") {
      // resultStatus OBSERVED + empty candidateNames deliberately falls
      // through buildUniversalHandoffMessage's deterministic templates
      // (conversation-extension-handoff-message.ts) to null — that function
      // wins over any model narration whenever it returns non-null, so this
      // is the only combination that reaches this domain's own
      // outcomeCode-specific prompt guidance in route.ts instead of a
      // generic "Kanonik kayıtlara göre: <name>." line.
      return {
        status: "HANDOFF",
        handoff: communicationHandoff({
          operation: "QUERY",
          outcomeCode: "PAYMENT_REMINDER_NO_OUTSTANDING_BALANCE",
          resultStatus: "OBSERVED",
          entityResolution: "RESOLVED",
        }),
      };
    }

    if (outcome.status === "SEND_FAILED") {
      // resultStatus FAILED already produces an accurate, generic
      // deterministic message ("couldn't complete this, try again?") — no
      // custom prompt guidance needed for this branch.
      return {
        status: "HANDOFF",
        handoff: communicationHandoff({
          operation: "CREATE",
          outcomeCode: "PAYMENT_REMINDER_SEND_FAILED",
          resultStatus: "FAILED",
          entityResolution: outcome.customerName ? "RESOLVED" : "NOT_FOUND",
          candidateNames: outcome.customerName ? [outcome.customerName] : [],
        }),
      };
    }

    // resultStatus EXECUTED + mutationPerformed already produces an
    // accurate deterministic confirmation ("İşlemi tamamladım.") — no
    // custom prompt guidance needed for this branch.
    return {
      status: "HANDOFF",
      handoff: communicationHandoff({
        operation: "CREATE",
        outcomeCode: "PAYMENT_REMINDER_SENT",
        resultStatus: "EXECUTED",
        entityResolution: "RESOLVED",
        candidateNames: [outcome.customerName],
        mutationPerformed: true,
      }),
    };
  },
};
