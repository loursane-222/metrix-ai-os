import type { ConversationExtension } from "./conversation-extension-contract";
import { communicationHandoff } from "./conversation-extension-handoff";
import { listCustomers } from "@/lib/customers/customers-client";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { navigateWhatsAppComposeTab, openWhatsAppComposeTab, whatsappNumber } from "./offer-management-conversation-extension";

// Residual Capability Parity Migration: the EMAIL-channel reminder path
// this extension used to also own (BALANCE_STEM/REMINDER_STEM/SEND_STEM ->
// requestPaymentReminder) is retired — the METRIX Executive Agent now owns
// that via its send_payment_reminder tool, a thin wrapper around the exact
// same resolveAndSendPaymentReminder service call. Only the WhatsApp-
// compose path remains here: it opens a browser tab (window.open), which is
// a genuinely client-only capability no server-side Agent tool can perform,
// so it cannot move — see conversation-extension-ownership-registry.ts's
// residual entry for this extension.
//
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

export function formatBalances(balances: readonly { currency: string; balanceCents: string }[]): string {
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
      // Opened synchronously, before any await — see openWhatsAppComposeTab's
      // comment (offer-management-conversation-extension.ts). Every early
      // return below must close it; only the success path navigates it.
      const composeTab = openWhatsAppComposeTab();
      const bail = (handoff: ReturnType<typeof communicationHandoff>) => { composeTab?.close(); return { status: "HANDOFF" as const, handoff }; };

      const found = await resolveCustomer(statementMatch[1]!.trim());
      if ("error" in found) return bail(communicationHandoff({ operation: "QUERY", outcomeCode: "PAYMENT_REMINDER_WHATSAPP_LOOKUP_FAILED", resultStatus: "FAILED" }));
      if (found.resolution.status === "NOT_FOUND") return bail(communicationHandoff({ operation: "QUERY", outcomeCode: "PAYMENT_REMINDER_WHATSAPP_CUSTOMER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }));
      if (found.resolution.status === "AMBIGUOUS") return bail(communicationHandoff({ operation: "QUERY", outcomeCode: "PAYMENT_REMINDER_WHATSAPP_CUSTOMER_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: found.resolution.options.map((option) => option.displayName) }));

      const customer = found.resolution.customer;
      const phone = customer.phone ? whatsappNumber(customer.phone) : "";
      if (!phone) return bail(communicationHandoff({ operation: "QUERY", outcomeCode: "PAYMENT_REMINDER_WHATSAPP_PHONE_MISSING", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "RESOLVED", candidateNames: [customer.displayName] }));

      const response = await fetch(`/api/customers/${encodeURIComponent(customer.id)}/statement-public-link`, { method: "POST", credentials: "include" });
      const payload = await response.json() as { ok?: boolean; data?: { publicUrl?: string; organizationName?: string; balances?: readonly { currency: string; balanceCents: string }[] } };
      if (!response.ok || !payload.ok || !payload.data?.publicUrl || !payload.data.organizationName) {
        return bail(communicationHandoff({ operation: "QUERY", outcomeCode: "PAYMENT_REMINDER_WHATSAPP_LINK_FAILED", resultStatus: "FAILED", entityResolution: "RESOLVED", failureCode: "STATEMENT_PUBLIC_LINK_FAILED" }));
      }

      const message = `${payload.data.organizationName} — hesap ekstrenizi mutabakat için paylaşıyoruz (${formatBalances(payload.data.balances ?? [])}): ${payload.data.publicUrl}`;
      navigateWhatsAppComposeTab(composeTab, phone, message);
      return { status: "HANDOFF", handoff: communicationHandoff({ operation: "QUERY", outcomeCode: "PAYMENT_REMINDER_WHATSAPP_STATEMENT_READY", resultStatus: "EXECUTED", entityResolution: "RESOLVED", candidateNames: [customer.displayName], mutationPerformed: true }) };
    }

    return { status: "NOT_HANDLED", handoff: null };
  },
};
