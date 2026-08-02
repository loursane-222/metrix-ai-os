// Global (not screen-scoped) Payment/Collection record entry point — mirrors
// offer-management-conversation-extension.ts exactly: a single-shot create
// (resolve the customer, create the record, land on the canonical list),
// no incremental draft/collecting state machine. This is the smallest slice
// of the Tahsilat (Collection) Foundation domain that is genuinely useful on
// its own: recording that a payment/receivable exists against a customer,
// optionally with a real due date (see extractDueDateClause below) — the
// only input that lets a real Payment ever reach OVERDUE
// (reconcileOverdueStatuses) and therefore ever produce a real
// CollectionAction AI suggestion (collection.set_lifecycle review panel on
// /metrix/collections).

import { listCustomers } from "@/lib/customers/customers-client";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { createPayment } from "@/lib/payments/payments-client";
import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { paymentHandoff } from "./conversation-extension-handoff";

const RECORD_PAYMENT_PATTERN = /^(.+?)\s+(?:için|icin)\s+(\d+(?:[.,]\d+)?)\s*(?:tl|try|₺)?\s*(?:tahsilat|ödeme|odeme)\s*(?:kaydet|kayıt et|kayit et|al)[.!]?$/i;

// Tahsilatlar Anayasası'nın "Ödeme Planı: Vade Tarihi" alanı — gerçek bir
// kullanıcının halihazırda vadesi geçmiş veya ileri vadeli bir alacağı
// kaydederken kullandığı doğal ifadeler. Ana desenle aynı deterministik
// regex stilinde, geriye dönük uyumlu (yoksa dueDate atlanır).
const OVERDUE_CLAUSE_PATTERN = /,?\s*vade(?:si)?\s+(\d+)\s*(?:gün|gun)\s*(?:önce\s*geçti|once\s*gecti|gecikti)\.?\s*$/i;
const FUTURE_DUE_CLAUSE_PATTERN = /,?\s*(\d+)\s*(?:gün|gun)\s*vadeli\.?\s*$/i;

function extractDueDateClause(text: string): { rest: string; dueDate: Date | undefined } {
  const overdue = text.match(OVERDUE_CLAUSE_PATTERN);
  if (overdue) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() - Number(overdue[1]));
    return { rest: text.slice(0, overdue.index).trim(), dueDate };
  }
  const future = text.match(FUTURE_DUE_CLAUSE_PATTERN);
  if (future) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + Number(future[1]));
    return { rest: text.slice(0, future.index).trim(), dueDate };
  }
  return { rest: text, dueDate: undefined };
}

function navigateToCollectionsList(source: ConversationExtensionSource, correlationId: string): void {
  if (typeof window === "undefined") return;
  void dispatchConversationNavigation({
    route: "/metrix/collections",
    source: source === "voice" ? "voice" : "written",
    correlationId,
    expectedSurfaceAuthorityKey: "collections.list.page",
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

export const paymentManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    if (typeof window === "undefined") return null;
    return `payments-management:${window.location.pathname}`;
  },

  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const { rest, dueDate } = extractDueDateClause(utterance.trim());
    const text = rest;
    const match = text.match(RECORD_PAYMENT_PATTERN);
    if (!match) return { status: "NOT_HANDLED", handoff: null };

    const amount = parseAmount(match[2]!);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { status: "HANDOFF", handoff: paymentHandoff({ operation: "CREATE", outcomeCode: "PAYMENT_CREATE_INVALID_AMOUNT", resultStatus: "FAILED", failureCode: "PAYMENT_INVALID_AMOUNT" }) };
    }

    const found = await resolveCustomer(match[1]!.trim());
    if ("error" in found) {
      return { status: "HANDOFF", handoff: paymentHandoff({ operation: "CREATE", outcomeCode: "PAYMENT_CREATE_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "PAYMENT_CUSTOMER_LOOKUP_FAILED" }) };
    }
    if (found.resolution.status === "NOT_FOUND") {
      return { status: "HANDOFF", handoff: paymentHandoff({ operation: "CREATE", outcomeCode: "PAYMENT_CREATE_CUSTOMER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
    }
    if (found.resolution.status === "AMBIGUOUS") {
      return {
        status: "HANDOFF",
        handoff: paymentHandoff({ operation: "CREATE", outcomeCode: "PAYMENT_CREATE_CUSTOMER_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: found.resolution.options.map((option) => option.displayName) }),
      };
    }

    const customer = found.resolution.customer;
    const createResult = await createPayment({ customerId: customer.id, title: `${customer.displayName} Tahsilatı`, amount, dueDate: dueDate?.toISOString() });
    if (!createResult.ok) {
      return { status: "HANDOFF", handoff: paymentHandoff({ operation: "CREATE", outcomeCode: "PAYMENT_CREATE_FAILED", resultStatus: "FAILED", failureCode: "PAYMENT_CREATE_REQUEST_FAILED" }) };
    }

    navigateToCollectionsList(source, correlationId);
    return {
      status: "HANDOFF",
      handoff: paymentHandoff({ operation: "CREATE", outcomeCode: "PAYMENT_CREATED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", mutationPerformed: true, navigationRequested: true, navigationStatus: "COMPLETED" }),
    };
  },
};
