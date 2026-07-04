import type { BriefingPackage, NewsImpact } from "@/lib/daily-briefing/daily-briefing.types";
import type { ExecutiveOperatingContext } from "@/lib/executive-operating-context";
import type { ExecutiveAlert } from "@/lib/executive-alerts/executive-alert.types";
import type { ForecastRiskSignal } from "@/lib/executive-forecasting/executive-forecasting.types";
import type {
  ExecutiveDailyBriefingV2,
  ExecutiveDailyBriefingV2MarketItem,
  ExecutiveDailyBriefingV2WatchSignal,
} from "./executive-daily-briefing-v2.types";
import {
  buildExecutiveDailyBriefingAwarenessSummary,
  buildExecutiveDailyBriefingDataQualityNote,
  buildExecutiveDailyBriefingFallbackWatchSignal,
  buildExecutiveDailyBriefingFocusSummary,
  buildExecutiveDailyBriefingFirstAction,
  buildExecutiveDailyBriefingForecastSummary,
  buildExecutiveDailyBriefingHeadline,
  buildExecutiveDailyBriefingNarrativeSummary,
  buildExecutiveDailyBriefingScorecardSummary,
  buildExecutiveDailyBriefingSignalTrendSummary,
  outcomeLabel,
  priorityLabel,
  severityLabel,
  sourceLabel,
  urgencyLabel,
} from "./executive-daily-briefing-v2-summary.service";

const BRIEFING_TIMEZONE = "Europe/Istanbul";
const MAX_ITEMS = 3;

export type ComposeExecutiveDailyBriefingV2Input = {
  organizationId: string;
  briefingDate: string;
  briefingPackage: BriefingPackage;
  operatingContext: ExecutiveOperatingContext;
};

export function composeExecutiveDailyBriefingV2(
  input: ComposeExecutiveDailyBriefingV2Input,
): ExecutiveDailyBriefingV2 {
  const { organizationId, briefingDate, briefingPackage, operatingContext } = input;

  return {
    organizationId,
    briefingDate,
    generatedAt: operatingContext.generatedAt,
    timezone: BRIEFING_TIMEZONE,
    headline: buildExecutiveDailyBriefingHeadline({ briefingPackage, operatingContext }),
    overallRiskLevel: operatingContext.executiveForecast?.overallRiskLevel ?? null,
    overallConfidence: operatingContext.executiveForecast?.overallConfidence ?? null,
    dataQualityNote: buildExecutiveDailyBriefingDataQualityNote(operatingContext),
    topPriorities: (operatingContext.executiveRhythm?.priorities ?? [])
      .slice(0, MAX_ITEMS)
      .map((priority) => ({
        rank: priority.rank,
        title: priority.headline,
        focus: priority.focus,
        actionHint: priority.actionHint,
        urgency: urgencyLabel(priority.urgency),
        source: sourceLabel(priority.source),
      })),
    criticalAlerts: (operatingContext.executiveAlerts?.criticalAlerts ?? [])
      .slice(0, MAX_ITEMS)
      .map((alert) => ({
        title: alert.headline,
        severity: severityLabel(alert.severity),
        actionHint: alert.actionableStep,
        source: "Yonetim uyarisi",
    })),
    watchSignals: buildWatchSignals(operatingContext),
    awarenessSummary: buildExecutiveDailyBriefingAwarenessSummary(operatingContext),
    scorecardSummary: buildExecutiveDailyBriefingScorecardSummary(operatingContext),
    executiveNarrativeSummary: buildExecutiveDailyBriefingNarrativeSummary(operatingContext),
    executiveFocusSummary: buildExecutiveDailyBriefingFocusSummary(operatingContext),
    forecastSummary: buildExecutiveDailyBriefingForecastSummary(operatingContext),
    decisionFollowUps: {
      openDecisions:
        operatingContext.executiveDecisionContext?.openDecisions.map((decision) => ({
          title: decision.title,
          reason: decision.rationale,
          actionHint: decision.actionHint,
          dueAt: decision.followUpDueAt,
          priority: priorityLabel(decision.priority),
        })) ?? [],
      overdueCommittedDecision:
        operatingContext.executiveDecisionContext?.overdueCommittedDecision
          ? {
              title: operatingContext.executiveDecisionContext.overdueCommittedDecision.title,
              reason: operatingContext.executiveDecisionContext.overdueCommittedDecision.rationale,
              actionHint:
                operatingContext.executiveDecisionContext.overdueCommittedDecision.actionHint,
              dueAt:
                operatingContext.executiveDecisionContext.overdueCommittedDecision.followUpDueAt,
              priority: priorityLabel(
                operatingContext.executiveDecisionContext.overdueCommittedDecision.priority,
              ),
            }
          : null,
      latestOutcome: operatingContext.executiveDecisionContext?.latestOutcome
        ? {
            decisionTitle: operatingContext.executiveDecisionContext.latestOutcome.decisionTitle,
            outcome: outcomeLabel(operatingContext.executiveDecisionContext.latestOutcome.outcome),
            summary: operatingContext.executiveDecisionContext.latestOutcome.summary,
            occurredAt: operatingContext.executiveDecisionContext.latestOutcome.occurredAt,
          }
        : null,
    },
    signalTrendSummary: buildExecutiveDailyBriefingSignalTrendSummary(operatingContext),
    marketBriefing: {
      criticalItems: briefingPackage.kritikItems.slice(0, MAX_ITEMS).map(toMarketItem),
      watchItems: briefingPackage.dikkatItems.slice(0, MAX_ITEMS).map(toMarketItem),
      sourceCount: briefingPackage.sourceCount,
    },
    firstAction: buildExecutiveDailyBriefingFirstAction({ briefingPackage, operatingContext }),
    actionOutcomeSummary: operatingContext.executiveFollowUpIntelligence?.recentActionOutcomes ?? null,
  };
}

function buildWatchSignals(
  operatingContext: ExecutiveOperatingContext,
): ExecutiveDailyBriefingV2WatchSignal[] {
  const signals: ExecutiveDailyBriefingV2WatchSignal[] = [];

  for (const alert of operatingContext.executiveAlerts?.watchAlerts ?? []) {
    if (signals.length >= MAX_ITEMS) break;
    signals.push(alertToWatchSignal(alert));
  }

  for (const signal of operatingContext.executiveForecast?.signals ?? []) {
    if (signals.length >= MAX_ITEMS) break;
    if (signal.riskLevel !== "WATCH" && signal.riskLevel !== "HIGH") continue;
    signals.push(forecastSignalToWatchSignal(signal));
  }

  if (signals.length === 0) {
    signals.push(buildExecutiveDailyBriefingFallbackWatchSignal());
  }

  return signals.slice(0, MAX_ITEMS);
}

function alertToWatchSignal(alert: ExecutiveAlert): ExecutiveDailyBriefingV2WatchSignal {
  return {
    title: alert.headline,
    reason: "Takip edilmesi gereken yonetim sinyali.",
    actionHint: alert.actionableStep,
    source: "Yonetim uyarisi",
  };
}

function forecastSignalToWatchSignal(
  signal: ForecastRiskSignal,
): ExecutiveDailyBriefingV2WatchSignal {
  return {
    title: signal.headline,
    reason: signal.explanation,
    actionHint: signal.actionableStep,
    source: "Tahmin ozeti",
  };
}

function toMarketItem(item: NewsImpact): ExecutiveDailyBriefingV2MarketItem {
  return {
    headline: item.headline,
    summary: item.summary,
    actionHint: item.yonetim_onerisi || null,
    source: item.primarySource.title || item.primarySource.domain || "Piyasa kaynagi",
  };
}
