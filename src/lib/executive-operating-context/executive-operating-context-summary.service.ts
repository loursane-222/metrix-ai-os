import type {
  ExecutiveOperatingContext,
  ExecutiveOperatingContextSummary,
} from "./executive-operating-context.types";

const MAX_CRITICAL_ALERTS = 3;

export function buildExecutiveOperatingContextSummary(
  context: ExecutiveOperatingContext,
): ExecutiveOperatingContextSummary {
  return {
    riskLevel: context.executiveForecast?.overallRiskLevel ?? null,
    topPriorities: context.executiveRhythm?.priorities ?? [],
    criticalAlerts: (context.executiveAlerts?.criticalAlerts ?? []).slice(
      0,
      MAX_CRITICAL_ALERTS,
    ),
    openDecisionCount: context.executiveDecisionContext?.openDecisions.length ?? 0,
    hasOverdueDecision:
      context.executiveDecisionContext?.overdueCommittedDecision !== null &&
      context.executiveDecisionContext?.overdueCommittedDecision !== undefined,
    signalTrendText: context.signal.trendContext?.formattedSummary ?? null,
    forecastSummary: context.executiveForecast?.executiveSummary ?? null,
    dataQualityNote: context.executiveForecast?.dataQualityNote ?? null,
  };
}
