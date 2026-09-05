/**
 * Domain-summary tools for cash / receivables / payables / financial
 * attention — section 8/9: each wraps an existing, already-correct
 * canonical dataset builder (src/lib/core/reporting/*, financial-attention,
 * financial-overview) as-is. No new business math here.
 */

import { z } from "zod";
import { tool } from "@openai/agents";
import { buildCurrentReceivableDataset } from "@/lib/core/reporting/current-receivable-intelligence.service";
import { buildCashFlowDataset, buildCashPositionDataset } from "@/lib/core/reporting/cash-management-intelligence.service";
import { buildCurrentPayableDataset } from "@/lib/core/reporting/current-payable-intelligence.service";
import { evaluateFinancialAttention } from "@/lib/financial-attention/financial-attention.policy";
import { buildFinancialManagementSynthesis } from "@/lib/financial-overview/financial-management-synthesis";
import { projectCollectionPerformanceTurnFact } from "@/lib/domain-evidence";
import { readCanonicalDomainEvidence } from "@/lib/domain-evidence/domain-evidence.service";
import { OrganizationRole } from "@prisma/client";
import { resolvedEvidence, unresolvedEvidence, type ExecutiveAgentRunContext } from "../types";

async function currentCollectionsFact(runContext: ExecutiveAgentRunContext, now: Date) {
  const adapterResults = await readCanonicalDomainEvidence(
    runContext.organizationId,
    (runContext.role as OrganizationRole) ?? OrganizationRole.OWNER,
    { now, timeZone: runContext.timeZone },
  );
  const records = adapterResults.flatMap((r) => r.evidence);
  return projectCollectionPerformanceTurnFact({ intent: "COLLECTION_PERFORMANCE", period: "CURRENT_MONTH" }, records);
}

export function buildCashPositionTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_cash_position",
    description: "Current real cash position across all accounts/currencies, right now.",
    parameters: z.object({}),
    async execute() {
      const dataset = await buildCashPositionDataset(runContext.organizationId, new Date());
      return resolvedEvidence({ factScope: "company.cash_position", data: dataset, source: "cash-management-intelligence.service" });
    },
  });
}

export function buildCashFlowTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_cash_flow",
    description: "Cash inflow/outflow/net for the current or previous calendar month.",
    parameters: z.object({ period: z.enum(["CURRENT_MONTH", "PREVIOUS_MONTH"]) }),
    async execute(input) {
      const dataset = await buildCashFlowDataset(runContext.organizationId, { periodKind: input.period, now: new Date(), timeZone: runContext.timeZone });
      return resolvedEvidence({ factScope: "company.cash_flow", data: dataset, source: "cash-management-intelligence.service" });
    },
  });
}

export function buildReceivablesOverviewTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_receivables_overview",
    description: "Total open receivables, overdue amounts, aging buckets, and per-customer breakdown, right now.",
    parameters: z.object({}),
    async execute() {
      const dataset = await buildCurrentReceivableDataset(runContext.organizationId, { now: new Date(), timeZone: runContext.timeZone });
      return resolvedEvidence({ factScope: "company.receivables", data: dataset, source: "current-receivable-intelligence.service" });
    },
  });
}

export function buildPayablesOverviewTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_payables_overview",
    description: "Total open payables, overdue amounts, aging buckets, and per-counterparty breakdown, right now.",
    parameters: z.object({}),
    async execute() {
      const dataset = await buildCurrentPayableDataset(runContext.organizationId, { now: new Date(), timeZone: runContext.timeZone });
      return resolvedEvidence({ factScope: "company.payables", data: dataset, source: "current-payable-intelligence.service" });
    },
  });
}

export function buildCollectionsPerformanceTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_collections_performance",
    description:
      "Current-month collection (tahsilat) performance — the canonical Settlement-based truth. " +
      "Always use this for \"tahsilatımız nasıl/sağlıklı mı\" questions; never derive collection performance from raw payment records yourself.",
    parameters: z.object({}),
    async execute() {
      const fact = await currentCollectionsFact(runContext, new Date());
      if (!fact) {
        return unresolvedEvidence({ status: "SOURCE_UNAVAILABLE", factScope: "company.collections_performance", source: "domain-evidence (settlement)", detail: "Bu dönem için tahsilat hareketleri doğrulanamadı." });
      }
      return resolvedEvidence({ factScope: "company.collections_performance", data: fact, source: "domain-evidence (settlement, canonical)" });
    },
  });
}

export function buildFinancialAttentionTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_financial_attention",
    description: "A cross-checked financial attention read combining receivables, payables, cash position, and current collections — flags what needs attention right now.",
    parameters: z.object({}),
    async execute() {
      const now = new Date();
      const [receivables, payables, cashPosition, currentCollections] = await Promise.all([
        buildCurrentReceivableDataset(runContext.organizationId, { now, timeZone: runContext.timeZone }),
        buildCurrentPayableDataset(runContext.organizationId, { now, timeZone: runContext.timeZone }),
        buildCashPositionDataset(runContext.organizationId, now),
        currentCollectionsFact(runContext, now),
      ]);
      if (!currentCollections) {
        return unresolvedEvidence({ status: "SOURCE_UNAVAILABLE", factScope: "company.financial_attention", source: "financial-attention.policy", detail: "Güncel tahsilat gerçeği doğrulanamadığı için finansal dikkat değerlendirmesi tamamlanamıyor." });
      }
      const attention = evaluateFinancialAttention({ receivables, payables, cashPosition, currentCollections });
      return resolvedEvidence({ factScope: "company.financial_attention", data: attention, source: "financial-attention.policy" });
    },
  });
}

export function buildFinancialOverviewTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_financial_overview",
    description: "A full current-month financial synthesis: collections, receivables, cash position, cash flow, payables, and attention flags in one call.",
    parameters: z.object({}),
    async execute() {
      const now = new Date();
      const [receivables, payables, cashPosition, cashFlow, currentCollections] = await Promise.all([
        buildCurrentReceivableDataset(runContext.organizationId, { now, timeZone: runContext.timeZone }),
        buildCurrentPayableDataset(runContext.organizationId, { now, timeZone: runContext.timeZone }),
        buildCashPositionDataset(runContext.organizationId, now),
        buildCashFlowDataset(runContext.organizationId, { periodKind: "CURRENT_MONTH", now, timeZone: runContext.timeZone }),
        currentCollectionsFact(runContext, now),
      ]);
      if (!currentCollections) {
        return unresolvedEvidence({ status: "SOURCE_UNAVAILABLE", factScope: "company.financial_overview", source: "financial-overview.service", detail: "Güncel tahsilat gerçeği doğrulanamadığı için finansal özet tamamlanamıyor." });
      }
      const attention = evaluateFinancialAttention({ receivables, payables, cashPosition, currentCollections });
      const synthesis = buildFinancialManagementSynthesis({ collections: currentCollections, receivables, cashPosition, cashFlow, payables, attention });
      return resolvedEvidence({ factScope: "company.financial_overview", data: synthesis, source: "financial-management-synthesis.service" });
    },
  });
}
