/**
 * Legacy Domain Semantic Ownership — Residual Capability Parity Migration.
 *
 * These tools give the METRIX Executive Agent the exact same execution
 * primitives six retired conversation extensions used to own directly —
 * field-visit reporting, a rep's own goal-setting report, the propose-not-
 * execute rep-request family (order/quote/payment), and the payment-
 * reminder/supplier-message communication utilities. Nothing here
 * reimplements their extraction, validation, permission, or notification
 * logic: every tool is a thin wrapper calling the SAME server-side service
 * function the retired extension's own API route called (verified by
 * reading each route in full). Only the semantic ownership moves — from a
 * free-text-matching client extension to the Agent deciding when to call
 * the tool.
 */

import { z } from "zod";
import { tool } from "@openai/agents";
import { resolvedEvidence, type ExecutiveAgentRunContext, type ExecutiveAgentClientAction } from "../types";
import { processFieldVisitReport } from "@/lib/field-visits/field-visit-report-orchestrator.service";
import { resolveFieldVisitWeeklySummaryRequest } from "@/lib/field-visits/field-visit-weekly-summary-request.service";
import { processRepGoalReport } from "@/lib/rep-goals/rep-goal-create-orchestrator.service";
import { proposeRepRequest } from "@/lib/rep-requests/rep-request-propose-orchestrator.service";
import type { RepRequestDomain } from "@/lib/rep-requests/rep-request.types";
import { resolveAndSendPaymentReminder } from "@/lib/executive-communication/payment-reminder-trigger-resolver";
import { generatePaymentReminderText } from "@/lib/executive-communication/payment-reminder-ai-adapter";
import { sendSupplierMessage } from "@/lib/executive-communication/executive-communication.service";
import { listCustomers as listCustomersForOrg } from "@/lib/core/customers/customer.service";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { ensurePublicStatementToken } from "@/lib/accounting/customer-statement-public-link.service";
import { getCustomerStatement } from "@/lib/accounting/customer-statement.service";
import { listQuotesByOrganization } from "@/lib/core/quotes/quote.service";
import { computeCarrierPerformance, computeDeliveryPerformance, computeShipmentIntegrity } from "@/lib/core/deliveries/delivery-intelligence.service";
import { resolveEntityReference } from "@/lib/executive-orchestration/entity-resolvers";
import { computeDeliveryCommitmentRate, refreshOrderIntelligence } from "@/lib/core/orders/order-intelligence.service";
import { getOrderByIdForOrganization, listOrders as listOrdersForOrg } from "@/lib/core/orders/order.service";
import { serializeOrder } from "@/lib/core/orders/order.serializer";
import { computeStockHealth, computeExecutiveSignals, listPendingInventoryVariances } from "@/lib/core/stock/stock-intelligence.service";
import { listStock } from "@/lib/core/stock/stock.service";
import { ensurePublicOfferToken } from "@/lib/core/offers/offer-public-link.service";
import { formatBalances } from "@/lib/conversation-extensions/payment-reminder-conversation-extension";
import { whatsappNumber, formatOfferAmount } from "@/lib/conversation-extensions/offer-management-conversation-extension";
import { listSuppliers as listSuppliersForOrg } from "@/lib/core/suppliers/supplier.service";
import { resolveSupplierReference } from "@/lib/suppliers/supplier-resolution";
import type { SupplierRecord } from "@/lib/suppliers/suppliers-client";
import { classifyDocumentAttachment, extractDocumentAttachment } from "@/lib/documents/document-intelligence-orchestrator.service";

// field_visit.create IS already a registered canonical Action Registry
// action (field-visits.actions.ts) with its own handler — but it only
// records the visit itself. The real compound capability a field rep's
// free-text report exercises — one visit log PLUS a conditionally-created
// order/payment, gated on the customer actually resolving, using a
// narrowly-scoped permission elevation (field reps don't otherwise have
// orders.write/payments.write) — lives entirely in
// processFieldVisitReport(), which already calls field_visit.create/
// order.create/payment.create itself via executeCanonicalOperation. Calling
// the bare action here instead would either lose the order/payment linkage
// or require handing the Agent the same elevated permissions generally,
// which is exactly the escalation this design avoids. This tool preserves
// the whole compound operation, unchanged.
export function buildLogFieldVisitReportTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "log_field_visit_report",
    description:
      "Logs a field rep's free-text visit report (who was visited, when, what was discussed) as a canonical field-visit record. " +
      "If the message also states a concrete order or payment, this creates those too — but ONLY when the visited customer resolves to a real METRIX record; otherwise it records the visit with the order/payment intent noted as unresolved, never fabricated. " +
      "Never guess or paraphrase the report yourself — pass the user's own words.",
    parameters: z.object({
      message: z.string().describe("The rep's own free-text visit report, verbatim."),
    }),
    async execute(input) {
      const outcome = await processFieldVisitReport({ authContext: runContext.authContext, message: input.message, correlationId: runContext.correlationId });
      return resolvedEvidence({ factScope: "field_visit.report", data: outcome, source: "field-visit-report-orchestrator" });
    },
  });
}

export function buildFieldVisitWeeklySummaryTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "get_field_visit_weekly_summary",
    description:
      "Looks up a field rep's (or the whole team's) real weekly visit summary — visit count, distinct customers, linked orders/payments, and goal achievement — from canonical visit records. " +
      "Pass the rep's name as targetReference, \"ekip\"/\"takım\" for the whole team, or omit it for the current user's own week. Read-only, never fabricates a number.",
    parameters: z.object({
      targetReference: z.string().nullable().describe("A colleague's name, \"ekip\"/\"takım\" for the team, or null for the current user's own week."),
    }),
    async execute(input) {
      const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: runContext.authContext, targetReference: input.targetReference });
      return resolvedEvidence({ factScope: "field_visit.weekly_summary", data: result, source: "field-visit-weekly-summary-request" });
    },
  });
}

// A distinct business object from goal.create (company-wide sales/
// collection targets, already an Agent-reachable Action Registry action):
// this submits a FIELD REP'S OWN goal-setting report, manager-role-gated,
// resolved against organization members by name — processRepGoalReport
// already does all of that; this tool changes nothing about it.
export function buildSubmitRepGoalReportTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "submit_rep_goal_report",
    description:
      "Records a field rep's visit/sales/collection goal from a manager's free-text message (e.g. \"Ahmet'in bu ay ziyaret hedefini 20 yap\"). Manager-role-gated — a non-manager caller gets a DENIED outcome, never a silent write. Pass the manager's own words verbatim.",
    parameters: z.object({
      message: z.string().describe("The manager's own free-text goal-setting message, verbatim."),
    }),
    async execute(input) {
      const outcome = await processRepGoalReport({ authContext: runContext.authContext, message: input.message });
      return resolvedEvidence({ factScope: "rep_goal.report", data: outcome, source: "rep-goal-create-orchestrator" });
    },
  });
}

// Preserves the propose-not-execute authority model exactly: this NEVER
// creates a real order/quote/payment — proposeRepRequest only stages a
// RepRequest business-candidate for office review (repRequestReviewConversationExtension,
// unchanged, is the only path that can approve/reject it). One tool covers
// all three domains because proposeRepRequest already does — a single,
// existing, domain-parametrized orchestrator, not three copies of the same
// logic.
export function buildProposeRepRequestTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "propose_rep_request",
    description:
      "Proposes a new order/quote/payment REQUEST for office approval on behalf of a field rep — this never creates the real order/quote/payment itself, only a pending request an office user must separately review and approve. Use when a rep's message asks to send something for approval (e.g. \"...için onay gönder/iste\"), not when they're directly creating a record they're authorized to create themselves.",
    parameters: z.object({
      domain: z.enum(["ORDER", "QUOTE", "PAYMENT"]).describe("Which kind of request this is."),
      message: z.string().describe("The rep's own free-text request message, verbatim."),
    }),
    async execute(input) {
      const outcome = await proposeRepRequest({ authContext: runContext.authContext, domain: input.domain as RepRequestDomain, message: input.message });
      return resolvedEvidence({ factScope: "rep_request.propose", data: outcome, source: "rep-request-propose-orchestrator" });
    },
  });
}

// Email-channel reminder only (resolveAndSendPaymentReminder ->
// sendPaymentReminder requires a recipient email; MISSING_RECIPIENT_EMAIL
// is a real, distinct outcome from success). The WhatsApp-compose variant
// (open a wa.me tab with a pre-written statement message) is a genuinely
// client-only capability — no server-side Agent tool can open a browser
// tab — and is intentionally NOT covered here; see the ownership registry
// for that residual.
export function buildSendPaymentReminderTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "send_payment_reminder",
    description:
      "Sends a payment/collection reminder EMAIL to a customer with an open balance, using their real account data — never fabricates an amount. Fails cleanly (MISSING_RECIPIENT_EMAIL / NO_OUTSTANDING_BALANCE) rather than guessing when the customer has no email on file or no real open balance.",
    parameters: z.object({
      customerReference: z.string().describe("The customer's name or reference, as the user said it."),
    }),
    async execute(input) {
      const outcome = await resolveAndSendPaymentReminder({
        utterance: input.customerReference,
        organizationId: runContext.organizationId,
        actorUserId: runContext.actorId,
        generateText: generatePaymentReminderText,
      });
      return resolvedEvidence({ factScope: "payment_reminder.send", data: outcome, source: "payment-reminder-trigger-resolver" });
    },
  });
}

export function buildSendSupplierMessageTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "send_supplier_message",
    description:
      "Sends an email message to a supplier with the user's own dictated text — never invents or embellishes the message body, only resolves who it goes to and delivers it verbatim.",
    parameters: z.object({
      supplierReference: z.string().describe("The supplier's name or reference, as the user said it."),
      messageBody: z.string().describe("The user's own message text, verbatim — never paraphrased."),
    }),
    async execute(input) {
      // Server-side listing (core supplier.service), not the browser
      // suppliers-client — this tool runs inside the Agent's own server
      // process, with no cookie jar to authenticate a relative fetch.
      // resolveSupplierReference only reads id/displayName/legalName/
      // phone/email/taxNumber/taxOffice; the raw Prisma rows already carry
      // every SupplierRecord field 1:1 except updatedAt (Date -> ISO string).
      const rawSuppliers = await listSuppliersForOrg({ organizationId: runContext.organizationId, status: "ACTIVE" });
      const suppliers: SupplierRecord[] = rawSuppliers.map((supplier) => ({ ...supplier, updatedAt: supplier.updatedAt.toISOString() }));
      const resolution = resolveSupplierReference(suppliers, input.supplierReference);
      if (resolution.status === "NOT_FOUND") {
        return resolvedEvidence({ factScope: "supplier_message.send", data: { outcome: "SUPPLIER_NOT_FOUND" as const }, source: "supplier-resolution" });
      }
      if (resolution.status === "AMBIGUOUS") {
        return resolvedEvidence({ factScope: "supplier_message.send", data: { outcome: "SUPPLIER_AMBIGUOUS" as const, options: resolution.options.map((option) => option.displayName) }, source: "supplier-resolution" });
      }
      const outcome = await sendSupplierMessage({
        organizationId: runContext.organizationId,
        supplierId: resolution.supplier.id,
        messageBody: input.messageBody,
        actorUserId: runContext.actorId,
      });
      return resolvedEvidence({ factScope: "supplier_message.send", data: { ...outcome, supplierDisplayName: resolution.supplier.displayName }, source: "executive-communication" });
    },
  });
}

// Classifies and extracts an already-uploaded financial document, exactly
// what documentIntelligenceConversationExtension used to do — same two
// service calls (classifyDocumentAttachment/extractDocumentAttachment,
// document-intelligence-orchestrator.service.ts), same "user text must
// never silently override document evidence" rule: if the document's own
// independent classification disagrees with what the Agent believes the
// user is claiming, this returns a mismatch instead of picking either
// interpretation. runContext.activeDocumentAttachment is trusted structured
// context from the client's own session pointer (never guessed from free
// text) — if it's null, there is nothing to analyze.
export function buildAnalyzeActiveDocumentAttachmentTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "analyze_active_document_attachment",
    description:
      "Classifies and extracts the document the user currently has attached in this conversation (a receipt/invoice/cheque/promissory note) into a structured business candidate awaiting approval. " +
      "Only usable when a document is actually attached — if there is none, this returns NO_ACTIVE_ATTACHMENT; tell the user to attach one first, never guess from prose. " +
      "requestedDomain is what you believe the user is claiming the document is (e.g. from \"bu gideri kaydet\" -> EXPENSE_RECEIPT) — if the document's own independent classification disagrees, this stops and asks for clarification instead of picking one.",
    parameters: z.object({
      requestedDomain: z.enum(["SALES_INVOICE", "PURCHASE_INVOICE", "EXPENSE_RECEIPT", "CHEQUE", "PROMISSORY_NOTE"]).describe("The document type the user's message implies."),
    }),
    async execute(input) {
      const attachment = runContext.activeDocumentAttachment;
      if (!attachment) {
        return resolvedEvidence({ factScope: "document_intelligence.analyze", data: { status: "NO_ACTIVE_ATTACHMENT" as const }, source: "document-attachment-session" });
      }
      const classified = await classifyDocumentAttachment({ organizationId: runContext.organizationId, actorId: runContext.actorId, attachmentRef: attachment.attachmentRef });
      if (classified.needsReview || classified.domain !== input.requestedDomain) {
        return resolvedEvidence({
          factScope: "document_intelligence.analyze",
          data: { status: "CLASSIFICATION_MISMATCH" as const, requestedDomain: input.requestedDomain, actualDomain: classified.domain, needsReview: classified.needsReview },
          source: "document-intelligence-orchestrator",
        });
      }
      const extracted = await extractDocumentAttachment({ organizationId: runContext.organizationId, actorId: runContext.actorId, attachmentRef: attachment.attachmentRef });
      return resolvedEvidence({ factScope: "document_intelligence.analyze", data: extracted, source: "document-intelligence-orchestrator" });
    },
  });
}

// The WhatsApp-statement-compose branch payment-reminder-conversation-
// extension.ts still owns is a genuinely client-only capability
// (window.open) — no server-side Agent tool can perform it. This tool is
// the Agent-owned HALF of the bridge described in the operation: it
// resolves the customer, mints the public statement link, and builds the
// exact same message text the old client extension did (formatBalances/
// whatsappNumber, unchanged, imported from it) — then hands the client a
// typed, trusted instruction (onClientAction) instead of opening anything
// itself. The client's only remaining job is rendering a button and, on an
// explicit LATER user click (never auto-triggered), performing window.open
// — see MetrixChatTab.tsx's MetrixBubble clientAction handling. This
// preserves the "Agent decides intent, client only executes a trusted
// instruction" invariant without asking a server-side Node process to open
// a browser tab, which is not possible.
export function buildComposePaymentReminderWhatsAppTool(runContext: ExecutiveAgentRunContext, onClientAction: (payload: ExecutiveAgentClientAction) => void) {
  return tool({
    name: "compose_payment_reminder_whatsapp",
    description:
      "Prepares a WhatsApp message with a customer's real account statement (balance + a live public link) and hands the CLIENT a ready-to-open compose instruction — it does not send anything itself; the user still clicks a button in the chat to actually open WhatsApp. " +
      "Use this specifically when the user asks to send an ekstre/mutabakat/hesap özeti via WhatsApp — for a plain email reminder, use send_payment_reminder instead.",
    parameters: z.object({
      customerReference: z.string().describe("The customer's name or reference, as the user said it."),
    }),
    async execute(input) {
      const customers = await listCustomersForOrg({ organizationId: runContext.organizationId, limit: 5000 });
      const resolution = resolveCustomerReference(customers, input.customerReference);
      if (resolution.status === "NOT_FOUND") {
        return resolvedEvidence({ factScope: "payment_reminder.whatsapp_compose", data: { status: "CUSTOMER_NOT_FOUND" as const }, source: "customer-resolution" });
      }
      if (resolution.status === "AMBIGUOUS") {
        return resolvedEvidence({ factScope: "payment_reminder.whatsapp_compose", data: { status: "CUSTOMER_AMBIGUOUS" as const, options: resolution.options.map((option) => option.displayName) }, source: "customer-resolution" });
      }
      const customer = resolution.customer;
      const phone = customer.phone ? whatsappNumber(customer.phone) : "";
      if (!phone) {
        return resolvedEvidence({ factScope: "payment_reminder.whatsapp_compose", data: { status: "PHONE_MISSING" as const, customerDisplayName: customer.displayName }, source: "customer-resolution" });
      }
      const [token, statement] = await Promise.all([
        ensurePublicStatementToken(customer.id, runContext.organizationId),
        getCustomerStatement(runContext.organizationId, customer.id),
      ]);
      const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/u, "");
      const publicUrl = `${configuredOrigin ?? ""}/mutabakat/${token}`;
      const message = `${runContext.organizationName} — hesap ekstrenizi mutabakat için paylaşıyoruz (${formatBalances(statement?.balances ?? [])}): ${publicUrl}`;
      onClientAction({ type: "whatsapp_compose", phone, message });
      return resolvedEvidence({ factScope: "payment_reminder.whatsapp_compose", data: { status: "READY" as const, customerDisplayName: customer.displayName }, source: "customer-statement" });
    },
  });
}

// invoice-management-conversation-extension.ts's own CREATE_FROM_QUOTE
// branch ("Atlas teklifinden fatura kes") never names the quote — it
// infers "the customer's own quote with a positive amount" via this exact
// filter (resolveInvoiceSourceQuote, same file, still exported for
// reference — same rule, ported here rather than reused directly since
// that function's QuoteRecord type differs from quote.service's raw
// Prisma shape). invoice.create's quoteId is already a resolvable entity
// reference for a NAMED quote (entity-resolvers.ts), but there is no
// existing tool to find an UNNAMED one by customer alone — this tool
// closes exactly that gap, so the Agent can still fulfill this phrasing
// via invoice.create without asking the user to name the quote when only
// one qualifies.
export function buildFindCustomerOpenQuoteTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "find_customer_open_quote",
    description:
      "Finds the ONE quote with a positive amount for a given customer, when the user refers to \"their quote\" without naming it (e.g. \"Atlas teklifinden fatura kes\"). Returns AMBIGUOUS if more than one qualifies — never guess which.",
    parameters: z.object({ customerId: z.string().describe("The customer's real id, already resolved.") }),
    async execute(input) {
      const quotes = await listQuotesByOrganization({ organizationId: runContext.organizationId });
      const candidates = quotes.filter((quote) => quote.customerId === input.customerId && quote.amount !== null && Number(quote.amount) > 0);
      if (candidates.length === 0) return resolvedEvidence({ factScope: "invoice.find_customer_open_quote", data: { status: "NOT_FOUND" as const }, source: "quote.service" });
      if (candidates.length > 1) return resolvedEvidence({ factScope: "invoice.find_customer_open_quote", data: { status: "AMBIGUOUS" as const, options: candidates.map((quote) => quote.title) }, source: "quote.service" });
      const quote = candidates[0]!;
      return resolvedEvidence({ factScope: "invoice.find_customer_open_quote", data: { status: "RESOLVED" as const, quoteId: quote.id, title: quote.title, amount: Number(quote.amount) }, source: "quote.service" });
    },
  });
}

// order-management-conversation-extension.ts's own CONVERT_QUOTE_PATTERN
// ("Atlas teklifini siparişe çevir") never names the quote either — it
// finds the customer's most recent WON quote (findQuoteForCustomer, same
// file). A DIFFERENT filter from find_customer_open_quote above (WON
// status + most-recent, not "any quote with a positive amount") — ported,
// not shared, since the business rule genuinely differs per caller.
export function buildFindCustomerWonQuoteTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "find_customer_won_quote",
    description: "Finds a customer's most recent WON quote, when the user refers to \"their quote\" without naming it (e.g. \"Atlas teklifini siparişe çevir\"). Use with order.createFromQuote.",
    parameters: z.object({ customerId: z.string().describe("The customer's real id, already resolved.") }),
    async execute(input) {
      const quotes = await listQuotesByOrganization({ organizationId: runContext.organizationId });
      const candidate = quotes
        .filter((quote) => quote.customerId === input.customerId && quote.status === "WON")
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
      if (!candidate) return resolvedEvidence({ factScope: "order.find_customer_won_quote", data: { status: "NOT_FOUND" as const }, source: "quote.service" });
      return resolvedEvidence({ factScope: "order.find_customer_won_quote", data: { status: "RESOLVED" as const, quoteId: candidate.id, title: candidate.title }, source: "quote.service" });
    },
  });
}

export function buildDeliveryCommitmentRateTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "delivery_commitment_rate",
    description: "Real on-time delivery commitment rate over a recent window — how reliably promised delivery dates are met.",
    parameters: z.object({ windowDays: z.number().int().min(1).nullable().describe("Lookback window in days; defaults to 90 if null.") }),
    async execute(input) {
      const result = await computeDeliveryCommitmentRate(runContext.organizationId, input.windowDays ?? 90);
      return resolvedEvidence({ factScope: "order.delivery_commitment_rate", data: result, source: "order-intelligence.service" });
    },
  });
}

// order-management-conversation-extension.ts's own FULFILLMENT/PRIORITY/
// RESERVATION queries all read the SAME 3 fields (fulfillmentSummary/
// priorityLabel/reservationStatus) serializeOrder already computes — one
// tool covers all three instead of three narrow ones. Resolves the order
// the same way every other domain reference is resolved, never guesses.
export function buildOrderDetailsTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "get_order_details",
    description: "Real details for one order — fulfillment status, priority, reservation status, items — by order number or a plain reference.",
    parameters: z.object({ orderReference: z.string().describe("The order's number or another plain-language reference, as the user said it.") }),
    async execute(input) {
      const resolution = await resolveEntityReference("order", runContext.organizationId, input.orderReference);
      if (resolution.status !== "RESOLVED") {
        return resolvedEvidence({ factScope: "order.details", data: resolution, source: "entity-resolvers" });
      }
      await refreshOrderIntelligence(resolution.id, runContext.organizationId);
      const order = await getOrderByIdForOrganization(resolution.id, runContext.organizationId);
      if (!order) return resolvedEvidence({ factScope: "order.details", data: { status: "NOT_FOUND" as const }, source: "order.service" });
      return resolvedEvidence({ factScope: "order.details", data: serializeOrder(order), source: "order.service", canonicalEntityId: resolution.id });
    },
  });
}

export function buildCriticalOrdersTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "list_critical_orders",
    description: "Lists orders whose computed priority is Kritik (critical) or, if requested, also Acil (urgent).",
    parameters: z.object({ includeUrgent: z.boolean().describe("true to also include Acil (urgent) orders, not just Kritik (critical).") }),
    async execute(input) {
      const orders = await listOrdersForOrg({ organizationId: runContext.organizationId, limit: 500 });
      const labels = input.includeUrgent ? ["Kritik", "Acil"] : ["Kritik"];
      const serialized = orders.map((order) => serializeOrder(order)).filter((order): order is NonNullable<typeof order> => order !== null);
      const matches = serialized.filter((order) => labels.includes(order.priorityLabel));
      return resolvedEvidence({ factScope: "order.critical_orders", data: { orderNumbers: matches.map((order) => order.orderNumber) }, source: "order.service" });
    },
  });
}

// Three read-only queries stock-management-conversation-extension.ts used
// to also own — same canonical stock-intelligence.service functions its
// own API routes already called.
export function buildStockHealthTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "stock_health",
    description: "Real stock health summary over a recent window — which products are critically low, dead/slow-moving stock, etc.",
    parameters: z.object({ windowDays: z.number().int().min(1).nullable().describe("Lookback window in days; defaults to 90 if null.") }),
    async execute(input) {
      const result = await computeStockHealth(runContext.organizationId, input.windowDays ?? 90);
      return resolvedEvidence({ factScope: "stock.health", data: result, source: "stock-intelligence.service" });
    },
  });
}

export function buildStockExecutiveSignalsTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "stock_executive_signals",
    description: "Real stock-related executive signal counts — risk, opportunity, operational, and open count-variance signals.",
    parameters: z.object({ windowDays: z.number().int().min(1).nullable().describe("Lookback window in days; defaults to 90 if null.") }),
    async execute(input) {
      const result = await computeExecutiveSignals(runContext.organizationId, input.windowDays ?? 90);
      return resolvedEvidence({ factScope: "stock.executive_signals", data: result, source: "stock-intelligence.service" });
    },
  });
}

export function buildListPendingStockVariancesTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "list_pending_stock_variances",
    description: "Lists physical stock counts still awaiting confirm/dismiss (pending variance records). Use stock.resolveVariance to act on one.",
    parameters: z.object({}),
    async execute() {
      const records = await listPendingInventoryVariances(runContext.organizationId);
      return resolvedEvidence({ factScope: "stock.pending_variances", data: { records }, source: "stock-intelligence.service" });
    },
  });
}

// stock.recordCount needs a real stockId, a row distinct from either
// productServiceId or warehouseId alone — this resolves one from BOTH
// references the same way every other domain reference is resolved
// (product/warehouse are already resolvable entity-reference domains), so
// the Agent never guesses it.
export function buildFindStockByProductAndWarehouseTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "find_stock_by_product_and_warehouse",
    description: "Finds the real stockId for one product at one warehouse, for use with stock.recordCount.",
    parameters: z.object({
      productReference: z.string().describe("The product's name or reference, as the user said it."),
      warehouseReference: z.string().nullable().describe("The warehouse's name, if the user mentioned one."),
    }),
    async execute(input) {
      const productResolution = await resolveEntityReference("product", runContext.organizationId, input.productReference);
      if (productResolution.status !== "RESOLVED") {
        return resolvedEvidence({ factScope: "stock.find_by_product_and_warehouse", data: { target: "PRODUCT" as const, resolution: productResolution }, source: "entity-resolvers" });
      }
      let warehouseId: string | undefined;
      if (input.warehouseReference) {
        const warehouseResolution = await resolveEntityReference("warehouse", runContext.organizationId, input.warehouseReference);
        if (warehouseResolution.status !== "RESOLVED") {
          return resolvedEvidence({ factScope: "stock.find_by_product_and_warehouse", data: { target: "WAREHOUSE" as const, resolution: warehouseResolution }, source: "entity-resolvers" });
        }
        warehouseId = warehouseResolution.id;
      }
      const stocks = await listStock({ organizationId: runContext.organizationId, productServiceId: productResolution.id, warehouseId });
      if (stocks.length === 0) return resolvedEvidence({ factScope: "stock.find_by_product_and_warehouse", data: { status: "NOT_FOUND" as const }, source: "stock.service" });
      if (stocks.length > 1) return resolvedEvidence({ factScope: "stock.find_by_product_and_warehouse", data: { status: "AMBIGUOUS" as const, options: stocks.map((stock) => stock.warehouseId) }, source: "stock.service" });
      return resolvedEvidence({ factScope: "stock.find_by_product_and_warehouse", data: { status: "RESOLVED" as const, stockId: stocks[0]!.id }, source: "stock.service" });
    },
  });
}

// offer-management-conversation-extension.ts's own SEND_WHATSAPP/OPEN_OFFER
// branches both resolve "the customer's most recent quote" with NO status
// filter (unlike find_customer_open_quote's positive-amount filter or
// find_customer_won_quote's WON-only filter) — a third, genuinely
// different business rule, ported not shared.
export function buildFindCustomerMostRecentQuoteTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "find_customer_most_recent_quote",
    description: "Finds a customer's most recent quote regardless of status, when the user refers to \"their quote\" without naming it. Use with compose_offer_whatsapp.",
    parameters: z.object({ customerId: z.string().describe("The customer's real id, already resolved.") }),
    async execute(input) {
      const quotes = await listQuotesByOrganization({ organizationId: runContext.organizationId });
      const candidate = quotes
        .filter((quote) => quote.customerId === input.customerId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
      if (!candidate) return resolvedEvidence({ factScope: "offer.find_customer_most_recent_quote", data: { status: "NOT_FOUND" as const }, source: "quote.service" });
      return resolvedEvidence({ factScope: "offer.find_customer_most_recent_quote", data: { status: "RESOLVED" as const, quoteId: candidate.id, title: candidate.title }, source: "quote.service" });
    },
  });
}

// The genuinely client-only half of offer-management-conversation-
// extension.ts's SEND_WHATSAPP branch (window.open) — same bridge pattern
// as compose_payment_reminder_whatsapp above: this resolves the quote,
// mints the public offer link, and builds the exact same message text
// (formatOfferAmount, imported unchanged), then hands the CLIENT a typed
// instruction instead of opening anything itself.
export function buildComposeOfferWhatsAppTool(runContext: ExecutiveAgentRunContext, onClientAction: (payload: ExecutiveAgentClientAction) => void) {
  return tool({
    name: "compose_offer_whatsapp",
    description:
      "Prepares a WhatsApp message with a real offer's public link and amount, and hands the CLIENT a ready-to-open compose instruction — it does not send anything itself; the user still clicks a button in the chat to actually open WhatsApp. " +
      "Resolve the quoteId first (find_customer_most_recent_quote, or the currently open offer workspace) and the customer's phone before calling this.",
    parameters: z.object({
      quoteId: z.string().describe("The real quote id, already resolved."),
      customerPhone: z.string().describe("The customer's phone number, as stored (any format — normalized here)."),
    }),
    async execute(input) {
      const phone = whatsappNumber(input.customerPhone);
      if (!phone) {
        return resolvedEvidence({ factScope: "offer.whatsapp_compose", data: { status: "PHONE_MISSING" as const }, source: "offer-management" });
      }
      const quotes = await listQuotesByOrganization({ organizationId: runContext.organizationId });
      const quote = quotes.find((candidate) => candidate.id === input.quoteId);
      if (!quote) {
        return resolvedEvidence({ factScope: "offer.whatsapp_compose", data: { status: "QUOTE_NOT_FOUND" as const }, source: "quote.service" });
      }
      const token = await ensurePublicOfferToken(quote.id, runContext.organizationId);
      const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/u, "");
      const publicUrl = `${configuredOrigin ?? ""}/teklif/${token}`;
      const message = `${runContext.organizationName} tarafından hazırlanan ${quote.title} teklifinizi (${formatOfferAmount(quote.amount === null ? null : quote.amount.toString(), quote.currency)}) inceleyebilirsiniz: ${publicUrl}`;
      onClientAction({ type: "whatsapp_compose", phone, message });
      return resolvedEvidence({ factScope: "offer.whatsapp_compose", data: { status: "READY" as const }, source: "offer-public-link.service" });
    },
  });
}

// payment-management-conversation-extension.ts's own OVERDUE_CLAUSE_PATTERN/
// FUTURE_DUE_CLAUSE_PATTERN ("vadesi 5 gün önce geçti" / "30 gün vadeli")
// resolve a relative due-date clause into an exact date from the server
// clock — the same "never let the model invent a date" rule as
// resolve_calendar_expression, just for payment.create's dueDate field
// instead of calendar_event.create's startAt.
export function buildResolveRelativeDueDateTool() {
  return tool({
    name: "resolve_relative_due_date",
    description:
      "Deterministically resolves a relative due-date clause (e.g. \"vadesi 5 gün önce geçti\" -> PAST/5, \"30 gün vadeli\" -> FUTURE/30) into an EXACT ISO date, computed from the real server clock — never invent or calculate this date yourself. Use the returned dueDateIso directly as payment.create's dueDate.",
    parameters: z.object({
      direction: z.enum(["PAST", "FUTURE"]).describe("PAST for \"X gün önce geçti\" (already overdue), FUTURE for \"X gün vadeli\" (due in the future)."),
      days: z.number().int().min(0).describe("The number of days, from the user's own words."),
    }),
    async execute(input) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (input.direction === "PAST" ? -input.days : input.days));
      return resolvedEvidence({ factScope: "payment.resolve_relative_due_date", data: { dueDateIso: dueDate.toISOString() }, source: "residual-capability-tools" });
    },
  });
}

// Three read-only queries delivery-management-conversation-extension.ts
// used to also own — none compute their own judgment, all format real
// evidence from the same canonical delivery-intelligence.service functions
// their own API routes (/api/deliveries/intelligence/carriers,
// .../performance) already called.
export function buildCarrierPerformanceTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "delivery_carrier_performance",
    description: "Real per-carrier delivery performance (on-time rate, damage rate, average delivery hours) over a recent window.",
    parameters: z.object({ windowDays: z.number().int().min(1).nullable().describe("Lookback window in days; defaults to 90 if null.") }),
    async execute(input) {
      const result = await computeCarrierPerformance(runContext.organizationId, input.windowDays ?? 90);
      return resolvedEvidence({ factScope: "delivery.carrier_performance", data: result, source: "delivery-intelligence.service" });
    },
  });
}

export function buildDeliveryPerformanceTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "delivery_performance",
    description: "Real overall delivery performance (on-time rate, first-attempt success rate, damage rate) over a recent window.",
    parameters: z.object({ windowDays: z.number().int().min(1).nullable().describe("Lookback window in days; defaults to 90 if null.") }),
    async execute(input) {
      const result = await computeDeliveryPerformance(runContext.organizationId, input.windowDays ?? 90);
      return resolvedEvidence({ factScope: "delivery.performance", data: result, source: "delivery-intelligence.service" });
    },
  });
}

export function buildShipmentIntegrityTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "shipment_integrity",
    description: "Real shipment-integrity check for one delivery (e.g. partial shipment, item condition issues), by delivery number or a plain reference — resolves it the same way every other domain reference is resolved, never guesses an id.",
    parameters: z.object({ deliveryReference: z.string().describe("The delivery's number or another plain-language reference, as the user said it.") }),
    async execute(input) {
      const resolution = await resolveEntityReference("delivery", runContext.organizationId, input.deliveryReference);
      if (resolution.status !== "RESOLVED") {
        return resolvedEvidence({ factScope: "delivery.shipment_integrity", data: resolution, source: "entity-resolvers" });
      }
      const result = await computeShipmentIntegrity(resolution.id, runContext.organizationId);
      return resolvedEvidence({ factScope: "delivery.shipment_integrity", data: result, source: "delivery-intelligence.service", canonicalEntityId: resolution.id });
    },
  });
}
