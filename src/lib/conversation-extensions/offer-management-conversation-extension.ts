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
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { createOffer, listQuotes } from "@/lib/offers/quotes-client";
import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { quoteHandoff } from "./conversation-extension-handoff";

const CREATE_OFFER_PATTERN = /^(.+?)\s+(?:için|icin)\s+(?:yeni\s+)?teklif\s+(?:hazırla|hazirla|oluştur|olustur)[.!]?$/i;
const OPEN_OFFER_PATTERN = /^(.+?)\s+teklif(?:i|ini)\s+(?:aç|ac)[.!]?$/i;
const SEND_WHATSAPP_PATTERN = /^(.+?)\s+teklif(?:i|ini)\s+(?:(?:whatsapp|whatsap)(?:'|’)?tan\s+)?g[öo]nder[.!]?$/iu;

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

function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/gu, "");
  if (/^90\d{10}$/u.test(digits)) return digits;
  if (/^0\d{10}$/u.test(digits)) return `90${digits.slice(1)}`;
  if (/^5\d{9}$/u.test(digits)) return `90${digits}`;
  return "";
}

function formatOfferAmount(amount: string | null, currency: string): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(Number(amount ?? 0));
}

export const offerManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    if (typeof window === "undefined") return null;
    return `offers-management:${window.location.pathname}`;
  },

  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();

    const sendMatch = text.match(SEND_WHATSAPP_PATTERN);
    if (sendMatch) {
      const found = await resolveCustomer(sendMatch[1]!.trim());
      if ("error" in found) return { status: "HANDOFF", handoff: quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "OFFER_CUSTOMER_LOOKUP_FAILED" }) };
      if (found.resolution.status === "NOT_FOUND") return { status: "HANDOFF", handoff: quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_CUSTOMER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
      if (found.resolution.status === "AMBIGUOUS") return { status: "HANDOFF", handoff: quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_CUSTOMER_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: found.resolution.options.map((option) => option.displayName) }) };
      const customer = found.resolution.customer;
      const phone = customer.phone ? whatsappNumber(customer.phone) : "";
      if (!phone) return { status: "HANDOFF", handoff: quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_PHONE_MISSING", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "RESOLVED", candidateNames: [customer.displayName] }) };
      const quotesResult = await listQuotes();
      if (!quotesResult.ok) return { status: "HANDOFF", handoff: quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_LIST_FAILED", resultStatus: "FAILED", failureCode: "OFFER_LIST_FAILED" }) };
      const quote = quotesResult.data.quotes.filter((candidate) => candidate.customerId === customer.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (!quote) return { status: "HANDOFF", handoff: quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_OFFER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
      const response = await fetch(`/api/quotes/${encodeURIComponent(quote.id)}/public-link`, { method: "POST", credentials: "include" });
      const payload = await response.json() as { ok?: boolean; data?: { publicUrl?: string; organizationName?: string } };
      if (!response.ok || !payload.ok || !payload.data?.publicUrl || !payload.data.organizationName) return { status: "HANDOFF", handoff: quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_LINK_FAILED", resultStatus: "FAILED", entityResolution: "RESOLVED", failureCode: "OFFER_PUBLIC_LINK_FAILED" }) };
      const message = `${payload.data.organizationName} tarafından hazırlanan ${quote.title} teklifinizi (${formatOfferAmount(quote.amount, quote.currency)}) inceleyebilirsiniz: ${payload.data.publicUrl}`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
      return { status: "HANDOFF", handoff: quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_WHATSAPP_READY", resultStatus: "EXECUTED", entityResolution: "RESOLVED", candidateNames: [customer.displayName], mutationPerformed: true }) };
    }

    const createMatch = text.match(CREATE_OFFER_PATTERN);
    if (createMatch) {
      const found = await resolveCustomer(createMatch[1]!.trim());
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
      const found = await resolveCustomer(openMatch[1]!.trim());
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
