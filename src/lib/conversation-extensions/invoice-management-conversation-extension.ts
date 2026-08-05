// Global (not screen-scoped) Invoice record entry point — mirrors
// payment-management-conversation-extension.ts exactly: a single-shot
// create (resolve the customer, create the record via the real Action
// Runtime gateway, land on the canonical list), no incremental draft state
// machine. Smallest useful slice of the Fatura Domain Anayasası: creating
// an internal DRAFT invoice against a customer. Marking an invoice SENT/
// PAID, real e-Fatura submission, and multi-line-item breakdown are
// deliberately not built here — the Invoice model, invoice.create action,
// and canonical list surface are the foundation a later operation extends.

import { listCustomers } from "@/lib/customers/customers-client";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { executeInvoiceCreateAction } from "@/lib/invoices/invoices-client";
import { listQuotes, type QuoteRecord } from "@/lib/offers/quotes-client";
import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { invoiceHandoff } from "./conversation-extension-handoff";

const RECORD_INVOICE_PATTERN = /^(.+?)\s+(?:için|icin)\s+(\d+(?:[.,]\d+)?)\s*(?:tl|try|₺)?(?:'?(?:lik|lık|luk|lük))?\s*fatura\s*(?:kes|kesin|oluştur|olustur|düzenle|duzenle)[.!]?$/i;
const CREATE_FROM_QUOTE_PATTERN = /^(.+?)\s+teklifinden\s+fatura\s*(?:kes|kesin|oluştur|olustur|düzenle|duzenle)[.!]?$/i;

function navigateToInvoicesList(source: ConversationExtensionSource, correlationId: string): void {
  if (typeof window === "undefined") return;
  void dispatchConversationNavigation({
    route: "/metrix/invoices",
    source: source === "voice" ? "voice" : "written",
    correlationId,
    expectedSurfaceAuthorityKey: "invoices.list.page",
  });
}

async function resolveCustomer(reference: string) {
  const response = await listCustomers();
  if (!response.ok) return { error: response.error } as const;
  return { resolution: resolveCustomerReference(response.data.customers, reference) } as const;
}

function parseAmount(raw: string): number {
  return Number(raw.replace(",", "."));
}

export function resolveInvoiceSourceQuote(quotes: readonly QuoteRecord[], customerId: string): QuoteRecord | null | "AMBIGUOUS" {
  const candidates = quotes.filter((quote) =>
    quote.customerId === customerId && quote.amount !== null && Number(quote.amount) > 0,
  );
  if (candidates.length === 0) return null;
  if (candidates.length > 1) return "AMBIGUOUS";
  return candidates[0]!;
}

export const invoiceManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    if (typeof window === "undefined") return null;
    return `invoices-management:${window.location.pathname}`;
  },

  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();
    const match = text.match(RECORD_INVOICE_PATTERN);
    const quoteMatch = text.match(CREATE_FROM_QUOTE_PATTERN);
    if (!match && !quoteMatch) return { status: "NOT_HANDLED", handoff: null };

    const amount = match ? parseAmount(match[2]!) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
      return { status: "HANDOFF", handoff: invoiceHandoff({ operation: "CREATE", outcomeCode: "INVOICE_CREATE_INVALID_AMOUNT", resultStatus: "FAILED", failureCode: "INVOICE_INVALID_AMOUNT" }) };
    }

    const found = await resolveCustomer((match?.[1] ?? quoteMatch?.[1])!.trim());
    if ("error" in found) {
      return { status: "HANDOFF", handoff: invoiceHandoff({ operation: "CREATE", outcomeCode: "INVOICE_CREATE_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "INVOICE_CUSTOMER_LOOKUP_FAILED" }) };
    }
    if (found.resolution.status === "NOT_FOUND") {
      return { status: "HANDOFF", handoff: invoiceHandoff({ operation: "CREATE", outcomeCode: "INVOICE_CREATE_CUSTOMER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
    }
    if (found.resolution.status === "AMBIGUOUS") {
      return {
        status: "HANDOFF",
        handoff: invoiceHandoff({ operation: "CREATE", outcomeCode: "INVOICE_CREATE_CUSTOMER_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: found.resolution.options.map((option) => option.displayName) }),
      };
    }

    const customer = found.resolution.customer;
    let sourceQuote: QuoteRecord | null = null;
    if (quoteMatch) {
      const quotes = await listQuotes();
      if (!quotes.ok) {
        return { status: "HANDOFF", handoff: invoiceHandoff({ operation: "CREATE", outcomeCode: "INVOICE_CREATE_QUOTE_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "INVOICE_QUOTE_LOOKUP_FAILED" }) };
      }
      const resolvedQuote = resolveInvoiceSourceQuote(quotes.data.quotes, customer.id);
      if (resolvedQuote === null || resolvedQuote === "AMBIGUOUS") {
        return { status: "HANDOFF", handoff: invoiceHandoff({ operation: "CREATE", outcomeCode: resolvedQuote === "AMBIGUOUS" ? "INVOICE_CREATE_QUOTE_AMBIGUOUS" : "INVOICE_CREATE_QUOTE_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: resolvedQuote === "AMBIGUOUS" ? "AMBIGUOUS" : "NOT_FOUND" }) };
      }
      sourceQuote = resolvedQuote;
    }

    const createResult = await executeInvoiceCreateAction({
      customerId: customer.id,
      title: sourceQuote ? `${sourceQuote.title} Faturası` : `${customer.displayName} Faturası`,
      amount: sourceQuote ? Number(sourceQuote.amount) : amount!,
      quoteId: sourceQuote?.id,
    });
    if (!createResult.ok) {
      return { status: "HANDOFF", handoff: invoiceHandoff({ operation: "CREATE", outcomeCode: "INVOICE_CREATE_FAILED", resultStatus: "FAILED", failureCode: "INVOICE_CREATE_REQUEST_FAILED" }) };
    }

    navigateToInvoicesList(source, correlationId);
    return {
      status: "HANDOFF",
      handoff: invoiceHandoff({ operation: "CREATE", outcomeCode: "INVOICE_CREATED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", mutationPerformed: true, navigationRequested: true, navigationStatus: "COMPLETED" }),
    };
  },
};
