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
import type { ConversationExtension } from "./conversation-extension-contract";
import { quoteHandoff } from "./conversation-extension-handoff";

const CREATE_OFFER_PATTERN = /^(.+?)\s+(?:için|icin)\s+(?:yeni\s+)?teklif\s+(?:hazırla|hazirla|oluştur|olustur)[.!]?$/i;
const OPEN_OFFER_PATTERN = /^(.+?)\s+teklif(?:i|ini)\s+(?:aç|ac)[.!]?$/i;

function navigate(path: string): void {
  if (typeof window !== "undefined") window.location.assign(path);
}

async function resolveCustomer(reference: string) {
  const response = await listCustomers();
  if (!response.ok) return { error: response.error } as const;
  return { resolution: resolveCustomerReference(response.data.customers, reference) } as const;
}

export const offerManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    if (typeof window === "undefined") return null;
    return `offers-management:${window.location.pathname}`;
  },

  async execute(utterance) {
    const text = utterance.trim();

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

      navigate(`/metrix/offers/${createResult.data.quote.id}/edit`);
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

      navigate(`/metrix/offers/${candidate.id}/edit`);
      return {
        status: "HANDOFF",
        handoff: quoteHandoff({ operation: "NAVIGATE", outcomeCode: "OFFER_OPENED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", navigationRequested: true, navigationStatus: "COMPLETED" }),
      };
    }

    return { status: "NOT_HANDLED", handoff: null };
  },
};
