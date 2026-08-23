// Global (not screen-scoped) Offer creation/open entry point — mirrors the
// activation shape of customer-management-conversation-extension.ts: active
// on every page by pathname, so "Atlas için yeni teklif hazırla" is handled
// here before it ever reaches general executive reasoning, exactly like
// "Atlas adında yeni müşteri oluştur" is handled by the customer extension.
//
// Deliberately smaller than the Customer create pipeline: Offer creation
// needs exactly one piece of information from the utterance (the customer),
// then hands off immediately to the real Offer Edit Living Workspace where
// the same conversational command chain Customer Edit uses (add item, set
// price, discount, send) takes over — see offer-edit-conversation-extension.ts.

import { listCustomers } from "@/lib/customers/customers-client";
import { resolveCustomerReference, type ResolvableCustomer } from "@/lib/customers/customer-resolution";
import { createOffer, listQuotes, type QuoteRecord } from "@/lib/offers/quotes-client";
import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { quoteHandoff } from "./conversation-extension-handoff";

const CREATE_OFFER_PATTERN = /^(.+?)\s+(?:için|icin)\s+(?:yeni\s+)?teklif\s+(?:hazırla|hazirla|oluştur|olustur)[.!]?$/i;
const OPEN_OFFER_PATTERN = /^(.+?)\s+teklif(?:i|ini)\s+(?:aç|ac)[.!]?$/i;
const SEND_WHATSAPP_PATTERN = /^(.+?)\s+teklif(?:i|ini)\s+(?:(?:whatsapp|whatsap)(?:'|’)?tan\s+)?g[öo]nder[.!]?$/iu;
const DEICTIC_REFERENCE = /^(?:bu|şu|su)(?:\s+(?:m[üu]şteri|teklif))?$/iu;

// Object-form dispatch (not the plain-string overload) so this routes through
// ExecutiveNavigationCommandHost's directive-publish path — the same path
// createCustomerWorkspaceDirective uses — instead of a raw router.push/full
// page navigation. This is what keeps the chat panel mounted and the URL on
// /metrix, per the Living Workspace model (see BusinessSurfaceResolver's
// "offer-edit" branch, resolved via createOfferWorkspaceDirective).
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
// statement/mutabakat WhatsApp send, same Turkish phone normalization rules.
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/gu, "");
  if (/^90\d{10}$/u.test(digits)) return digits;
  if (/^0\d{10}$/u.test(digits)) return `90${digits.slice(1)}`;
  if (/^5\d{9}$/u.test(digits)) return `90${digits}`;
  return "";
}

function formatOfferAmount(amount: string | null, currency: string): string {
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

    const sendMatch = text.match(SEND_WHATSAPP_PATTERN);
    if (sendMatch) {
      // Opened synchronously, before any await, so the browser still
      // attributes it to this turn's user action — see
      // openWhatsAppComposeTab's comment. Every early return below must
      // close it; only the success path navigates it.
      const composeTab = openWhatsAppComposeTab();
      const bail = (handoff: ReturnType<typeof quoteHandoff>) => { composeTab?.close(); return { status: "HANDOFF" as const, handoff }; };
      const deictic = DEICTIC_REFERENCE.test(sendMatch[1]!.trim());
      let customer: ResolvableCustomer;
      let quote: QuoteRecord;
      if (deictic) {
        const quoteId = activeWorkspaceContext?.domain === "offer" ? activeWorkspaceContext.entityId : null;
        if (!quoteId) return bail(quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_OFFER_REQUIRED", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }));
        const quotesResult = await listQuotes();
        if (!quotesResult.ok) return bail(quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_LIST_FAILED", resultStatus: "FAILED", failureCode: "OFFER_LIST_FAILED" }));
        const contextualQuote = quotesResult.data.quotes.find((candidate) => candidate.id === quoteId);
        if (!contextualQuote) return bail(quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_OFFER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }));
        const customersResult = await listCustomers();
        if (!customersResult.ok) return bail(quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "OFFER_CUSTOMER_LOOKUP_FAILED" }));
        const contextualCustomer = customersResult.data.customers.find((candidate) => candidate.id === contextualQuote.customerId);
        if (!contextualCustomer) return bail(quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_CUSTOMER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }));
        customer = contextualCustomer;
        quote = contextualQuote;
      } else {
        const found = await resolveCustomer(sendMatch[1]!.trim());
        if ("error" in found) return bail(quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "OFFER_CUSTOMER_LOOKUP_FAILED" }));
        if (found.resolution.status === "NOT_FOUND") return bail(quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_CUSTOMER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }));
        if (found.resolution.status === "AMBIGUOUS") return bail(quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_CUSTOMER_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: found.resolution.options.map((option) => option.displayName) }));
        customer = found.resolution.customer;
        if (!customer.phone || !whatsappNumber(customer.phone)) return bail(quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_PHONE_MISSING", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "RESOLVED", candidateNames: [customer.displayName] }));
        const quotesResult = await listQuotes();
        if (!quotesResult.ok) return bail(quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_LIST_FAILED", resultStatus: "FAILED", failureCode: "OFFER_LIST_FAILED" }));
        const namedQuote = quotesResult.data.quotes.filter((candidate) => candidate.customerId === customer.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        if (!namedQuote) return bail(quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_OFFER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }));
        quote = namedQuote;
      }
      const phone = customer.phone ? whatsappNumber(customer.phone) : "";
      if (!phone) return bail(quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_PHONE_MISSING", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "RESOLVED", candidateNames: [customer.displayName] }));
      const response = await fetch(`/api/quotes/${encodeURIComponent(quote.id)}/public-link`, { method: "POST", credentials: "include" });
      const payload = await response.json() as { ok?: boolean; data?: { publicUrl?: string; organizationName?: string } };
      if (!response.ok || !payload.ok || !payload.data?.publicUrl || !payload.data.organizationName) return bail(quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_LINK_FAILED", resultStatus: "FAILED", entityResolution: "RESOLVED", failureCode: "OFFER_PUBLIC_LINK_FAILED" }));
      const message = `${payload.data.organizationName} tarafından hazırlanan ${quote.title} teklifinizi (${formatOfferAmount(quote.amount, quote.currency)}) inceleyebilirsiniz: ${payload.data.publicUrl}`;
      navigateWhatsAppComposeTab(composeTab, phone, message);
      return { status: "HANDOFF", handoff: quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_READY", resultStatus: "EXECUTED", entityResolution: "RESOLVED", candidateNames: [customer.displayName], mutationPerformed: true }) };
    }

    const createMatch = text.match(CREATE_OFFER_PATTERN);
    if (createMatch) {
      const reference = createMatch[1]!.trim();
      const contextualCustomerId = DEICTIC_REFERENCE.test(reference) && activeWorkspaceContext?.domain === "customer" ? activeWorkspaceContext.entityId : null;
      const found = contextualCustomerId
        ? await resolveCustomerById(contextualCustomerId)
        : DEICTIC_REFERENCE.test(reference)
          ? { resolution: { status: "NOT_FOUND" as const } }
          : await resolveCustomer(reference);
      if ("error" in found) {
        return { status: "HANDOFF", handoff: quoteHandoff({ operation: "CREATE", outcomeCode: "OFFER_CREATE_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "OFFER_CUSTOMER_LOOKUP_FAILED" }) };
      }
      if (found.resolution.status === "NOT_FOUND") {
        return { status: "HANDOFF", handoff: quoteHandoff({ operation: "CREATE", outcomeCode: "OFFER_CREATE_CUSTOMER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
      }
      if (found.resolution.status === "AMBIGUOUS") {
        return {
          status: "HANDOFF",
          handoff: quoteHandoff({ operation: "CREATE", outcomeCode: "OFFER_CREATE_CUSTOMER_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: found.resolution.options.map((option) => option.displayName) }),
        };
      }

      const customer = found.resolution.customer;
      const createResult = await createOffer({ customerId: customer.id, title: `${customer.displayName} Teklifi` });
      if (!createResult.ok) {
        return { status: "HANDOFF", handoff: quoteHandoff({ operation: "CREATE", outcomeCode: "OFFER_CREATE_FAILED", resultStatus: "FAILED", failureCode: "OFFER_CREATE_REQUEST_FAILED" }) };
      }

      navigateToOfferEdit(createResult.data.quote.id, source, correlationId);
      return {
        status: "HANDOFF",
        handoff: quoteHandoff({ operation: "CREATE", outcomeCode: "OFFER_CREATED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", mutationPerformed: true, navigationRequested: true, navigationStatus: "COMPLETED" }),
      };
    }

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

async function resolveCustomerById(customerId: string) {
  const response = await listCustomers();
  if (!response.ok) return { error: response.error } as const;
  const customer = response.data.customers.find((candidate) => candidate.id === customerId);
  return { resolution: customer ? { status: "RESOLVED" as const, customer } : { status: "NOT_FOUND" as const } } as const;
}
