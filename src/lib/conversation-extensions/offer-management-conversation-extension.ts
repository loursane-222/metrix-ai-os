// Residual Capability Parity Migration: this extension is narrowed to ONLY
// its OPEN_OFFER navigation branch (resolve a customer's most recent quote
// and open the Offer Edit Living Workspace) — the other two capabilities
// it used to own are retired:
//   - CREATE_OFFER  -> quote.create was ALREADY a complete canonical
//     action once its manifest's amount field was corrected from
//     incorrectly-required to optional (quotes.actions.ts) — matching
//     handleQuoteCreate's own real contract and this extension's own
//     documented design (create a bare draft, hand off to the Edit
//     workspace for pricing). No new plumbing beyond that manifest fix.
//   - SEND_WHATSAPP -> compose_offer_whatsapp Agent tool (residual-
//     capability-tools.ts) resolves the quote and mints the public link
//     the exact same way, but hands the CLIENT a typed compose
//     instruction instead of opening a tab itself (window.open is
//     genuinely client-only) — see MetrixChatTab.tsx's clientAction
//     handling, same bridge as payment-reminder's WhatsApp branch.
// whatsappNumber/formatOfferAmount/openWhatsAppComposeTab/
// navigateWhatsAppComposeTab stay exported: still used by
// payment-reminder-conversation-extension.ts's own (still client-only)
// WhatsApp branch and by the new compose_offer_whatsapp/
// compose_payment_reminder_whatsapp Agent tools.

import { listCustomers } from "@/lib/customers/customers-client";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { listQuotes } from "@/lib/offers/quotes-client";
import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { quoteHandoff } from "./conversation-extension-handoff";

const OPEN_OFFER_PATTERN = /^(.+?)\s+teklif(?:i|ini)\s+(?:aç|ac)[.!]?$/i;
const DEICTIC_REFERENCE = /^(?:bu|şu|su)(?:\s+(?:m[üu]şteri|teklif))?$/iu;

function navigateToOfferEdit(quoteId: string, source: ConversationExtensionSource, correlationId: string): void {
  if (typeof window === "undefined") return;
  void dispatchConversationNavigation({
    route: `/metrix/offers/${quoteId}/edit`,
    source: source === "voice" ? "voice" : "written",
    correlationId,
    expectedSurfaceAuthorityKey: "offers.edit.page",
  });
}

async function resolveCustomer(reference: string) {
  const response = await listCustomers();
  if (!response.ok) return { error: response.error } as const;
  return { resolution: resolveCustomerReference(response.data.customers, reference) } as const;
}

// Exported — also used by payment-reminder-conversation-extension.ts's
// statement/mutabakat WhatsApp send and by compose_offer_whatsapp/
// compose_payment_reminder_whatsapp (residual-capability-tools.ts), same
// Turkish phone normalization rules.
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/gu, "");
  if (/^90\d{10}$/u.test(digits)) return digits;
  if (/^0\d{10}$/u.test(digits)) return `90${digits.slice(1)}`;
  if (/^5\d{9}$/u.test(digits)) return `90${digits}`;
  return "";
}

export function formatOfferAmount(amount: string | null, currency: string): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(Number(amount ?? 0));
}

// Most browsers only treat window.open() as user-initiated (not a blocked
// popup) when it happens synchronously within the click/submit handler —
// once a real network round-trip (a fetch for the public link) has
// happened first, the "user activation" that permits it may already have
// expired. Opening a blank tab immediately, then redirecting THAT tab's
// location once the real URL is known, keeps the open() call itself as
// close to the triggering action as this code can get; every failure path
// after opening it must close it again rather than leaving a blank tab
// behind. Exported — also used by payment-reminder-conversation-extension.ts.
export function openWhatsAppComposeTab(): Window | null {
  return typeof window === "undefined" ? null : window.open("", "_blank");
}

export function navigateWhatsAppComposeTab(tab: Window | null, phone: string, message: string): void {
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  if (tab && !tab.closed) { tab.location.href = url; return; }
  // Early open() failed or the tab was already closed — last-resort direct
  // open, which still works when the browser's activation window is more
  // lenient than the worst case this function defends against.
  window.open(url, "_blank");
}

export const offerManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    if (typeof window === "undefined") return null;
    return `offers-management:${window.location.pathname}`;
  },

  async execute(utterance, source = "written", correlationId = crypto.randomUUID(), activeWorkspaceContext) {
    const text = utterance.trim();

    const openMatch = text.match(OPEN_OFFER_PATTERN);
    if (openMatch) {
      const reference = openMatch[1]!.trim();
      if (DEICTIC_REFERENCE.test(reference)) {
        const quoteId = activeWorkspaceContext?.domain === "offer" ? activeWorkspaceContext.entityId : null;
        if (!quoteId) return { status: "HANDOFF", handoff: quoteHandoff({ operation: "NAVIGATE", outcomeCode: "OFFER_OPEN_REFERENCE_REQUIRED", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
        navigateToOfferEdit(quoteId, source, correlationId);
        return { status: "HANDOFF", handoff: quoteHandoff({ operation: "NAVIGATE", outcomeCode: "OFFER_OPENED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", navigationRequested: true, navigationStatus: "COMPLETED" }) };
      }
      const found = await resolveCustomer(reference);
      if ("error" in found) {
        return { status: "HANDOFF", handoff: quoteHandoff({ operation: "NAVIGATE", outcomeCode: "OFFER_OPEN_LOOKUP_FAILED", resultStatus: "FAILED" }) };
      }
      if (found.resolution.status === "NOT_FOUND") {
        return { status: "HANDOFF", handoff: quoteHandoff({ operation: "NAVIGATE", outcomeCode: "OFFER_OPEN_CUSTOMER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
      }
      if (found.resolution.status === "AMBIGUOUS") {
        return { status: "HANDOFF", handoff: quoteHandoff({ operation: "NAVIGATE", outcomeCode: "OFFER_OPEN_CUSTOMER_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS" }) };
      }

      const customer = found.resolution.customer;
      const quotesResult = await listQuotes();
      if (!quotesResult.ok) {
        return { status: "HANDOFF", handoff: quoteHandoff({ operation: "NAVIGATE", outcomeCode: "OFFER_OPEN_LIST_FAILED", resultStatus: "FAILED" }) };
      }

      const candidate = quotesResult.data.quotes
        .filter((quote) => quote.customerId === customer.id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (!candidate) {
        return { status: "HANDOFF", handoff: quoteHandoff({ operation: "NAVIGATE", outcomeCode: "OFFER_OPEN_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED" }) };
      }

      navigateToOfferEdit(candidate.id, source, correlationId);
      return {
        status: "HANDOFF",
        handoff: quoteHandoff({ operation: "NAVIGATE", outcomeCode: "OFFER_OPENED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", navigationRequested: true, navigationStatus: "COMPLETED" }),
      };
    }

    return { status: "NOT_HANDLED", handoff: null };
  },
};
