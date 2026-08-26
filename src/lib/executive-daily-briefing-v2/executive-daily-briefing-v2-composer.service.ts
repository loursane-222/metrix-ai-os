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
  agendaItems?: Array<{
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    allDay: boolean;
    status: string;
  }>;
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
    financialSnapshot: buildFinancialSnapshot(operatingContext),
    agenda: buildAgenda(input),
    firstAction: buildExecutiveDailyBriefingFirstAction({ briefingPackage, operatingContext }),
    actionOutcomeSummary: operatingContext.executiveFollowUpIntelligence?.recentActionOutcomes ?? null,
  };
}

function buildFinancialSnapshot(operatingContext: ExecutiveOperatingContext): ExecutiveDailyBriefingV2["financialSnapshot"] {
  const payments = operatingContext.paymentContext;
  const expenses = operatingContext.expenseContext;
  if (!payments && !expenses) return [];
  return [
    {
      key: "receivable",
      label: "Toplam alacak",
      value: payments?.totalReceivable ?? null,
      currency: "TRY",
      status: payments && payments.totalReceivable > 0 ? "POSITIVE" : "NEUTRAL",
      detail: payments ? `${payments.pendingCount + payments.partialCount + payments.overdueCount} açık ödeme` : "Ödeme verisi bulunmuyor",
    },
    {
      key: "overdue",
      label: "Gecikmiş alacak",
      value: payments?.totalOverdue ?? null,
      currency: "TRY",
      status: payments && payments.totalOverdue > 0 ? "CRITICAL" : "NEUTRAL",
      detail: payments ? `${payments.overdueCount} gecikmiş kayıt` : "Ödeme verisi bulunmuyor",
    },
    {
      key: "monthlyBurn",
      label: "Aylık düzenli gider",
      value: expenses?.monthlyBurnRate ?? null,
      currency: "TRY",
      status: expenses?.hasExpenseData ? "WATCH" : "NEUTRAL",
      detail: expenses?.hasExpenseData ? `${expenses.pendingCount} bekleyen, ${expenses.overdueCount} gecikmiş gider` : "Gider serisi bulunmuyor",
    },
  ];
}

function buildAgenda(input: ComposeExecutiveDailyBriefingV2Input): ExecutiveDailyBriefingV2["agenda"] {
  const calendarItems = (input.agendaItems ?? []).map((item) => ({
    ...item,
    kind: "CALENDAR" as const,
  }));
  const taskItems = (input.operatingContext.taskContext?.openItems ?? [])
    .filter((task) => task.dueDate?.slice(0, 10) === input.briefingDate)
    .map((task) => ({
      id: task.id,
      title: task.title,
      startsAt: task.dueDate,
      endsAt: null,
      allDay: true,
      kind: "TASK" as const,
      status: task.status,
    }));
  return [...calendarItems, ...taskItems]
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""))
    .slice(0, 6);
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

  return signals.slice(0, MAX_ITEMS);
}

function alertToWatchSignal(alert: ExecutiveAlert): ExecutiveDailyBriefingV2WatchSignal {
  return {
    title: alert.headline,
    reason: "Takip edilmesi gereken yönetim sinyali.",
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
