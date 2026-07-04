import type {
  BuildExecutiveRhythmInput,
  DailyPriority,
  ExecutiveCheckpoint,
  ExecutiveRhythm,
  FocusArea,
  PrioritySource,
  PriorityUrgency,
} from "./executive-rhythm.types";
import type { AlertCategory, ExecutiveAlert } from "@/lib/executive-alerts/executive-alert.types";
import type { ForecastRiskType } from "@/lib/executive-forecasting/executive-forecasting.types";

const MAX_PRIORITIES = 3;

const ALERT_CATEGORY_TO_FOCUS: Record<AlertCategory, FocusArea> = {
  COLLECTION_PRESSURE: "COLLECTION",
  CASH_FLOW_RISK: "CASH",
  QUOTE_PIPELINE_RISK: "SALES",
  EXECUTION_GAP: "COLLECTION",
  CURRENCY_EXPOSURE: "MARKET",
  MARKET_RISK: "MARKET",
  STRATEGIC_HEALTH: "CASH",
};

const FORECAST_TYPE_TO_FOCUS: Record<ForecastRiskType, FocusArea> = {
  COLLECTION_RISK: "COLLECTION",
  CASH_FLOW: "CASH",
  QUOTE_CONVERSION: "SALES",
  CURRENCY_RISK: "MARKET",
  EXECUTION_RISK: "COLLECTION",
  GOAL_GAP: "FOLLOW_UP",
};

const FOCUS_LABELS: Record<FocusArea, string> = {
  COLLECTION: "Tahsilat",
  SALES: "Teklif takibi",
  CASH: "Nakit akisi",
  MARKET: "Dis gelismeler",
  FOLLOW_UP: "Taahhut takibi",
};

type PriorityCandidate = Omit<DailyPriority, "rank">;

export function buildExecutiveRhythm(
  input: BuildExecutiveRhythmInput,
): ExecutiveRhythm {
  const checkpoint = buildCheckpoint(input);
  const candidates: PriorityCandidate[] = [];
  const usedFocusAreas = new Set<FocusArea>();

  // 1. Gecikmiş kalıcı karar takibi
  if (input.decisionContext?.overdueCommittedDecision) {
    const decision = input.decisionContext.overdueCommittedDecision;
    candidates.push({
      focus: FOCUS_LABELS["FOLLOW_UP"],
      headline: `"${decision.title}" kararinin sonucu bekleniyor.`,
      actionHint: "Kullaniciya sonucu sor.",
      urgency: "TODAY",
      source: "decision",
      focusArea: "FOLLOW_UP",
    });
    usedFocusAreas.add("FOLLOW_UP");
  }

  // 2. Gecikmiş commitment takibi
  if (
    checkpoint.isFollowUpDue &&
    checkpoint.committedTitle &&
    !usedFocusAreas.has("FOLLOW_UP")
  ) {
    candidates.push({
      focus: FOCUS_LABELS["FOLLOW_UP"],
      headline: `"${checkpoint.committedTitle}" kararinin takibi bekleniyor.`,
      actionHint: "Kullaniciya sonucu sor.",
      urgency: "TODAY",
      source: "commitment",
      focusArea: "FOLLOW_UP",
    });
    usedFocusAreas.add("FOLLOW_UP");
  }

  // 3. CRITICAL alertler
  for (const alert of (input.executiveAlerts?.criticalAlerts ?? [])) {
    if (candidates.length >= MAX_PRIORITIES) break;
    const focusArea = ALERT_CATEGORY_TO_FOCUS[alert.category];
    if (usedFocusAreas.has(focusArea)) continue;
    candidates.push(alertToCandidate(alert, focusArea, "TODAY"));
    usedFocusAreas.add(focusArea);
  }

  // 4. HIGH alertler
  for (const alert of (input.executiveAlerts?.highAlerts ?? [])) {
    if (candidates.length >= MAX_PRIORITIES) break;
    const focusArea = ALERT_CATEGORY_TO_FOCUS[alert.category];
    if (usedFocusAreas.has(focusArea)) continue;
    candidates.push(alertToCandidate(alert, focusArea, "TODAY"));
    usedFocusAreas.add(focusArea);
  }

  // 5. Açık yüksek öncelikli kararlar
  for (const decision of input.decisionContext?.openDecisions ?? []) {
    if (candidates.length >= MAX_PRIORITIES) break;
    if (decision.priority !== "CRITICAL" && decision.priority !== "HIGH") continue;
    const focusArea = decisionCategoryToFocusArea(decision.category);
    if (usedFocusAreas.has(focusArea)) continue;
    candidates.push({
      focus: FOCUS_LABELS[focusArea],
      headline: decision.title,
      actionHint: decision.actionHint,
      urgency: decision.priority === "CRITICAL" ? "TODAY" : "THIS_WEEK",
      source: "decision",
      focusArea,
    });
    usedFocusAreas.add(focusArea);
  }

  // 6. Forecast risk (alert'ların kapsayamadığı focus area varsa)
  if (candidates.length < MAX_PRIORITIES && input.executiveForecast) {
    const forecast = input.executiveForecast;
    const topSignal = forecast.signals.find(
      (s) => s.riskLevel === "CRITICAL" || s.riskLevel === "HIGH",
    );
    if (topSignal) {
      const focusArea = FORECAST_TYPE_TO_FOCUS[topSignal.riskType];
      if (!usedFocusAreas.has(focusArea)) {
        candidates.push({
          focus: FOCUS_LABELS[focusArea],
          headline: topSignal.headline,
          actionHint: topSignal.actionableStep ?? null,
          urgency: "THIS_WEEK",
          source: "forecast" as PrioritySource,
          focusArea,
        });
        usedFocusAreas.add(focusArea);
      }
    }
  }

  // 7. Satış odağı
  if (candidates.length < MAX_PRIORITIES && !usedFocusAreas.has("SALES")) {
    const qi = input.quoteIntelligence;
    if (qi && (qi.staleQuoteCount > 0 || qi.hotQuoteCount > 0)) {
      const headline =
        qi.staleQuoteCount > 0
          ? `${qi.staleQuoteCount} teklif uzun suredir hareketsiz; donusum riski var.`
          : `${qi.hotQuoteCount} sicak teklif takip bekliyor.`;
      candidates.push({
        focus: FOCUS_LABELS["SALES"],
        headline,
        actionHint: qi.nextBestActions.length > 0 ? qi.nextBestActions[0] : null,
        urgency: "THIS_WEEK",
        source: "quote",
        focusArea: "SALES",
      });
      usedFocusAreas.add("SALES");
    }
  }

  // 8. Piyasa odağı — taze brifing varsa
  if (candidates.length < MAX_PRIORITIES && !usedFocusAreas.has("MARKET")) {
    const briefing = input.latestBriefing;
    if (briefing && briefing.kritikItems.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      if (briefing.briefingDate === today) {
        const item = briefing.kritikItems[0];
        candidates.push({
          focus: FOCUS_LABELS["MARKET"],
          headline: item.headline,
          actionHint: item.yonetim_onerisi || null,
          urgency: "TODAY",
          source: "briefing",
          focusArea: "MARKET",
        });
        usedFocusAreas.add("MARKET");
      }
    }
  }

  const priorities: DailyPriority[] = candidates
    .slice(0, MAX_PRIORITIES)
    .map((p, i) => ({ ...p, rank: (i + 1) as 1 | 2 | 3 }));

  return {
    organizationId: input.organizationId,
    generatedAt: new Date().toISOString(),
    priorities,
    primaryFocusArea: priorities.length > 0 ? priorities[0].focusArea : null,
    checkpoint,
    hasPriorities: priorities.length > 0,
  };
}

// ─── Checkpoint ───────────────────────────────────────────────────────────────

function buildCheckpoint(input: BuildExecutiveRhythmInput): ExecutiveCheckpoint {
  const state = input.conversationState;

  if (!state || state.phase !== "COMMITTED" || !state.committedTitle) {
    return {
      hasActiveCommitment: false,
      committedTitle: null,
      isFollowUpDue: false,
      followUpDueAt: null,
      commitmentOutcome: null,
    };
  }

  const isFollowUpDue =
    state.followUpDueAt !== null &&
    new Date().toISOString() > state.followUpDueAt &&
    state.commitmentOutcome === null;

  return {
    hasActiveCommitment: true,
    committedTitle: state.committedTitle,
    isFollowUpDue,
    followUpDueAt: state.followUpDueAt,
    commitmentOutcome: state.commitmentOutcome,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function alertToCandidate(
  alert: ExecutiveAlert,
  focusArea: FocusArea,
  urgency: PriorityUrgency,
): PriorityCandidate {
  return {
    focus: FOCUS_LABELS[focusArea],
    headline: alert.headline,
    actionHint: alert.actionableStep,
    urgency,
    source: "alert",
    focusArea,
  };
}

function decisionCategoryToFocusArea(category: string | null): FocusArea {
  if (category === "SALES" || category === "QUOTE_PIPELINE_RISK") return "SALES";
  if (
    category === "FINANCE" ||
    category === "CASH_FLOW_RISK" ||
    category === "CASH_FLOW"
  ) {
    return "CASH";
  }
  if (category === "MARKET_RISK" || category === "CURRENCY_RISK") return "MARKET";
  if (category === "OPERATIONS" || category === "EXECUTION") return "COLLECTION";
  return "COLLECTION";
}
