/**
 * Additional canonical Settlement-based collection tools beyond
 * company_collections_performance (see financial-tools.ts): period
 * comparison, driver attribution, and target/goal position. Each wraps an
 * existing domain-evidence projector as-is (arithmetic-only, no inference).
 */

import { z } from "zod";
import { tool } from "@openai/agents";
import {
  projectCollectionComparisonTurnFact,
  projectCollectionDriversTurnFact,
  projectCollectionTargetTurnFact,
} from "@/lib/domain-evidence";
import { readCanonicalDomainEvidence } from "@/lib/domain-evidence/domain-evidence.service";
import { OrganizationRole } from "@prisma/client";
import { resolvedEvidence, unresolvedEvidence, type ExecutiveAgentRunContext } from "../types";

async function evidenceRecords(runContext: ExecutiveAgentRunContext) {
  const adapterResults = await readCanonicalDomainEvidence(
    runContext.organizationId,
    (runContext.role as OrganizationRole) ?? OrganizationRole.OWNER,
    { now: new Date(), timeZone: runContext.timeZone },
  );
  return adapterResults.flatMap((r) => r.evidence);
}

export function buildCollectionsComparisonTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_collections_comparison",
    description: "Compares collection (tahsilat) totals between two periods, e.g. this month vs previous month, or this week vs previous week.",
    parameters: z.object({
      primaryPeriod: z.enum(["CURRENT_MONTH", "CURRENT_WEEK"]),
      comparablePeriod: z.enum(["PREVIOUS_MONTH", "PREVIOUS_WEEK"]),
    }),
    async execute(input) {
      const records = await evidenceRecords(runContext);
      const fact = projectCollectionComparisonTurnFact({ intent: "COLLECTION_COMPARISON", primaryPeriod: input.primaryPeriod, comparablePeriod: input.comparablePeriod }, records);
      if (!fact) return unresolvedEvidence({ status: "SOURCE_UNAVAILABLE", factScope: "company.collections_comparison", source: "domain-evidence (settlement)" });
      return resolvedEvidence({ factScope: "company.collections_comparison", data: fact, source: "domain-evidence (settlement, canonical)" });
    },
  });
}

export function buildCollectionsDriversTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_collections_drivers",
    description: "Per-customer arithmetic attribution of what changed in collections between this month and previous month (who contributed to the increase/decrease). Arithmetic attribution only — never infer operational causality beyond it.",
    parameters: z.object({}),
    async execute() {
      const records = await evidenceRecords(runContext);
      const fact = projectCollectionDriversTurnFact({ intent: "COLLECTION_DRIVERS", primaryPeriod: "CURRENT_MONTH", comparablePeriod: "PREVIOUS_MONTH" }, records);
      if (!fact) return unresolvedEvidence({ status: "SOURCE_UNAVAILABLE", factScope: "company.collections_drivers", source: "domain-evidence (settlement)" });
      return resolvedEvidence({ factScope: "company.collections_drivers", data: fact, source: "domain-evidence (settlement, canonical)" });
    },
  });
}

export function buildCollectionsTargetTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_collections_target_position",
    description: "This month's collection goal vs actual realization, if a goal is configured. A missing goal is reported as missing, never as zero.",
    parameters: z.object({}),
    async execute() {
      const records = await evidenceRecords(runContext);
      const fact = projectCollectionTargetTurnFact({ intent: "COLLECTION_TARGET_POSITION", period: "CURRENT_MONTH" }, records);
      if (!fact) return unresolvedEvidence({ status: "SOURCE_UNAVAILABLE", factScope: "company.collections_target_position", source: "domain-evidence (settlement)" });
      return resolvedEvidence({ factScope: "company.collections_target_position", data: fact, source: "domain-evidence (settlement, canonical)" });
    },
  });
}
