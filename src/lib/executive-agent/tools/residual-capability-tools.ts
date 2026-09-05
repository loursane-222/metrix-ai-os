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
import { resolvedEvidence, type ExecutiveAgentRunContext } from "../types";
import { processFieldVisitReport } from "@/lib/field-visits/field-visit-report-orchestrator.service";
import { resolveFieldVisitWeeklySummaryRequest } from "@/lib/field-visits/field-visit-weekly-summary-request.service";
import { processRepGoalReport } from "@/lib/rep-goals/rep-goal-create-orchestrator.service";
import { proposeRepRequest } from "@/lib/rep-requests/rep-request-propose-orchestrator.service";
import type { RepRequestDomain } from "@/lib/rep-requests/rep-request.types";
import { resolveAndSendPaymentReminder } from "@/lib/executive-communication/payment-reminder-trigger-resolver";
import { generatePaymentReminderText } from "@/lib/executive-communication/payment-reminder-ai-adapter";
import { sendSupplierMessage } from "@/lib/executive-communication/executive-communication.service";
import { listSuppliers as listSuppliersForOrg } from "@/lib/core/suppliers/supplier.service";
import { resolveSupplierReference } from "@/lib/suppliers/supplier-resolution";
import type { SupplierRecord } from "@/lib/suppliers/suppliers-client";

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
