/**
 * Sales pipeline / order / invoicing / operations domain-summary tools.
 * Each wraps an existing canonical dataset builder from src/lib/sales-
 * intelligence and src/lib/management-intelligence as-is.
 */

import { z } from "zod";
import { tool } from "@openai/agents";
import {
  buildConfirmedOrderFlowDataset,
  buildCurrentOrderBacklogDataset,
  buildCurrentQuotePipelineDataset,
  buildQuoteActivityDataset,
  buildQuoteSentCohortDataset,
} from "@/lib/sales-intelligence";
import {
  buildCurrentOrderOperationsDataset,
  buildInvoicedActivityDataset,
  buildOperationsManagementDataset,
  buildCustomerManagementDataset,
} from "@/lib/management-intelligence";
import { buildCurrentReceivableDataset } from "@/lib/core/reporting/current-receivable-intelligence.service";
import { resolvedEvidence, type ExecutiveAgentRunContext } from "../types";

const PERIOD = z.enum(["CURRENT_MONTH", "PREVIOUS_MONTH"]);

export function buildQuoteActivityTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_quote_activity",
    description: "How many quotes were created/sent/viewed/accepted/rejected in a period.",
    parameters: z.object({
      activity: z.enum(["CREATED", "SENT", "VIEWED", "ACCEPTED", "REJECTED"]),
      countMode: z.enum(["DISTINCT_QUOTES", "EVENTS"]),
      period: PERIOD,
    }),
    async execute(input) {
      const dataset = await buildQuoteActivityDataset(runContext.organizationId, {
        intent: { intent: "QUOTE_ACTIVITY", activity: input.activity, countMode: input.countMode, period: input.period },
        now: new Date(),
        timeZone: runContext.timeZone,
      });
      return resolvedEvidence({ factScope: "company.quote_activity", data: dataset, source: "sales-intelligence" });
    },
  });
}

export function buildQuoteCohortTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_quote_cohort",
    description: "The current-value outcome (approved/rejected/still-open) of quotes that were sent in a given month cohort.",
    parameters: z.object({ period: PERIOD }),
    async execute(input) {
      const dataset = await buildQuoteSentCohortDataset(runContext.organizationId, { intent: { intent: "QUOTE_COHORT", period: input.period }, now: new Date(), timeZone: runContext.timeZone });
      return resolvedEvidence({ factScope: "company.quote_cohort", data: dataset, source: "sales-intelligence" });
    },
  });
}

export function buildQuotePipelineTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_quote_pipeline",
    description: "Open (not yet won/lost) quote pipeline: summary, total value, largest open quote, or per-customer distribution.",
    parameters: z.object({ queryMode: z.enum(["SUMMARY", "TOTAL_VALUE", "LARGEST_OPEN", "CUSTOMER_DISTRIBUTION"]) }),
    async execute(input) {
      const dataset = await buildCurrentQuotePipelineDataset(runContext.organizationId, { intent: "QUOTE_PIPELINE", queryMode: input.queryMode });
      return resolvedEvidence({ factScope: "company.quote_pipeline", data: dataset, source: "sales-intelligence" });
    },
  });
}

export function buildOrderBacklogTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_order_backlog",
    description: "Current undelivered order backlog: count and value by currency.",
    parameters: z.object({}),
    async execute() {
      const dataset = await buildCurrentOrderBacklogDataset(runContext.organizationId, { intent: "ORDER_BACKLOG" });
      return resolvedEvidence({ factScope: "company.order_backlog", data: dataset, source: "sales-intelligence" });
    },
  });
}

export function buildConfirmedOrderFlowTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_confirmed_order_flow",
    description: "Orders confirmed within a period: count and confirmed value by currency.",
    parameters: z.object({ period: PERIOD }),
    async execute(input) {
      const dataset = await buildConfirmedOrderFlowDataset(runContext.organizationId, { intent: { intent: "CONFIRMED_ORDER_FLOW", period: input.period }, now: new Date(), timeZone: runContext.timeZone });
      return resolvedEvidence({ factScope: "company.confirmed_order_flow", data: dataset, source: "sales-intelligence" });
    },
  });
}

export function buildInvoicedActivityTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_invoiced_activity",
    description: "Invoiced/posted sales activity in a period: posting count, invoice count, reversal count, net value by currency and by customer.",
    parameters: z.object({ period: PERIOD }),
    async execute(input) {
      const dataset = await buildInvoicedActivityDataset(runContext.organizationId, { intent: { intent: "INVOICED_ACTIVITY", period: input.period }, now: new Date(), timeZone: runContext.timeZone });
      return resolvedEvidence({ factScope: "company.invoiced_activity", data: dataset, source: "management-intelligence" });
    },
  });
}

export function buildOrderOperationsTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_order_operations",
    description: "Open/overdue/due-today order operations right now, with per-customer breakdown.",
    parameters: z.object({}),
    async execute() {
      const dataset = await buildCurrentOrderOperationsDataset(runContext.organizationId, { now: new Date(), timeZone: runContext.timeZone });
      return resolvedEvidence({ factScope: "company.order_operations", data: dataset, source: "management-intelligence" });
    },
  });
}

export function buildOperationsOverviewTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_operations_overview",
    description: "A combined operations snapshot: order operations plus open/overdue/due-today task counts.",
    parameters: z.object({}),
    async execute() {
      const dataset = await buildOperationsManagementDataset(runContext.organizationId, { now: new Date(), timeZone: runContext.timeZone });
      return resolvedEvidence({ factScope: "company.operations_overview", data: dataset, source: "management-intelligence" });
    },
  });
}

export function buildCustomerManagementOverviewTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_customer_management_overview",
    description: "A cross-domain per-customer summary: open quotes, open/overdue orders, receivables, and invoiced value — for company-wide customer-relationship questions, not a single named customer (use company_query's single_customer scope for that).",
    parameters: z.object({}),
    async execute() {
      const now = new Date();
      const [receivables, quotePipeline, orderOperations, invoicedActivity] = await Promise.all([
        buildCurrentReceivableDataset(runContext.organizationId, { now, timeZone: runContext.timeZone }),
        buildCurrentQuotePipelineDataset(runContext.organizationId, { intent: "QUOTE_PIPELINE", queryMode: "SUMMARY" }),
        buildCurrentOrderOperationsDataset(runContext.organizationId, { now, timeZone: runContext.timeZone }),
        buildInvoicedActivityDataset(runContext.organizationId, { intent: { intent: "INVOICED_ACTIVITY", period: "CURRENT_MONTH" }, now, timeZone: runContext.timeZone }),
      ]);
      const dataset = buildCustomerManagementDataset(receivables, quotePipeline, orderOperations, invoicedActivity);
      return resolvedEvidence({ factScope: "company.customer_management_overview", data: dataset, source: "management-intelligence" });
    },
  });
}
