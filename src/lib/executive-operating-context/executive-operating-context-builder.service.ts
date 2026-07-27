import { buildExecutiveBrainContext } from "@/lib/executive-brain/executive-brain-context-builder.service";

import type {
  BuildExecutiveOperatingContextInput,
  ExecutiveOperatingContext,
} from "./executive-operating-context.types";

/**
 * Legacy surface projection.
 *
 * This function no longer owns business reads, management reasoning or writes.
 * It invokes the same canonical Domain Evidence boundary as Management Picture
 * and returns only a compatibility-shaped, side-effect-free projection for
 * dashboard/briefing consumers that have not yet changed their public DTO.
 */
export async function buildExecutiveOperatingContext(
  input: BuildExecutiveOperatingContextInput,
): Promise<ExecutiveOperatingContext> {
  const canonicalContext = await buildExecutiveBrainContext({
    organizationId: input.organizationId,
    now: input.now,
  });
  const generatedAt = (input.now ?? new Date()).toISOString();
  const failedSteps = (canonicalContext.sourceReliability ?? [])
    .filter((source) => !source.connected || source.domainState === "FAILED")
    .map((source) => `domain_evidence:${source.source}`);

  return {
    organizationId: input.organizationId,
    mode: input.mode,
    generatedAt,
    today: generatedAt.slice(0, 10),
    memoryContext: input.preloadedMemoryContext ?? emptyMemoryContext(
      input.organizationId,
      generatedAt,
    ),
    personContext: [],
    quoteContext: null,
    quoteConversionContext: null,
    quoteIntelligence: null,
    paymentContext: null,
    paymentIntelligence: null,
    collectionActionContext: null,
    latestBriefing: null,
    executiveForecast: null,
    executiveAlerts: null,
    executiveDecisionContext: null,
    executiveDecisionFollowUp: null,
    executiveAccountability: null,
    executiveRhythm: null,
    executiveAwareness: null,
    executiveScorecard: null,
    executiveNarrative: null,
    executiveFocus: null,
    goalIntelligence: null,
    customerPortfolioIntelligence: null,
    customerHealthIntelligence: null,
    expenseContext: null,
    expenseIntelligence: null,
    financialHealthIntelligence: null,
    companyPerformanceSignal: null,
    executivePriority: null,
    executiveOperatingRhythm: null,
    executiveFollowUpIntelligence: null,
    recentCompletedExecutiveActions: null,
    signal: {
      dailyAnchorSnapshot: null,
      sourceSignalSnapshot: null,
      recentSnapshots: [],
      trendContext: null,
    },
    diagnostics: {
      failedSteps,
      writeActions: [],
    },
    runDeferredOperatingContextWrites: async () => undefined,
  };
}

function emptyMemoryContext(organizationId: string, generatedAt: string) {
  return {
    version: "v1" as const,
    generatedAt,
    organizationId,
    totalIncluded: 0,
    facts: [],
    processes: [],
    strategic: [],
    preferences: [],
    highlights: [],
    conflicts: [],
  };
}
