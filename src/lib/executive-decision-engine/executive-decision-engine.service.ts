import type { AlertCategory, ExecutiveAlert } from "@/lib/executive-alerts/executive-alert.types";
import type {
  ForecastRiskSignal,
  ForecastRiskType,
} from "@/lib/executive-forecasting/executive-forecasting.types";
import type { ExecutiveFocusArea } from "@/lib/executive-focus";
import type { FocusArea } from "@/lib/executive-rhythm/executive-rhythm.types";
import type { ExecutiveScorecardArea } from "@/lib/executive-scorecard";
import type { ExecutiveAwarenessWatchArea } from "@/lib/executive-awareness";
import {
  buildExecutiveDecisionPromptSummary,
  buildExecutiveDecisionSummary,
  categoryLabel,
  defaultFirstAction,
} from "./executive-decision-summary.service";
import type {
  BuildExecutiveDecisionResultInput,
  ExecutiveDecision,
  ExecutiveDecisionCategory,
  ExecutiveDecisionConfidence,
  ExecutiveDecisionPriority,
  ExecutiveDecisionResult,
} from "./executive-decision-engine.types";

const MAX_SUPPORTING_DECISIONS = 3;
const MAX_LIST_ITEMS = 4;

const ALERT_CATEGORY_TO_DECISION: Record<AlertCategory, ExecutiveDecisionCategory> = {
  COLLECTION_PRESSURE: "COLLECTION",
  CASH_FLOW_RISK: "CASH",
  QUOTE_PIPELINE_RISK: "SALES",
  EXECUTION_GAP: "EXECUTION",
  CURRENCY_EXPOSURE: "MARKET",
  MARKET_RISK: "MARKET",
  STRATEGIC_HEALTH: "STRATEGY",
};

const FORECAST_TYPE_TO_DECISION: Record<ForecastRiskType, ExecutiveDecisionCategory> = {
  COLLECTION_RISK: "COLLECTION",
  QUOTE_CONVERSION: "SALES",
  CASH_FLOW: "CASH",
  CURRENCY_RISK: "MARKET",
  EXECUTION_RISK: "EXECUTION",
  GOAL_GAP: "STRATEGY",
};

const SCORECARD_AREA_TO_DECISION: Record<ExecutiveScorecardArea, ExecutiveDecisionCategory> = {
  CASH_HEALTH: "CASH",
  COLLECTION_HEALTH: "COLLECTION",
  SALES_PIPELINE_HEALTH: "SALES",
  EXECUTION_HEALTH: "EXECUTION",
  DECISION_DISCIPLINE: "DECISION_FOLLOW_UP",
  MARKET_EXPOSURE: "MARKET",
  SIGNAL_MOMENTUM: "STRATEGY",
  DATA_QUALITY: "DATA_QUALITY",
};

const FOCUS_AREA_TO_DECISION: Record<ExecutiveFocusArea, ExecutiveDecisionCategory> = {
  CASH: "CASH",
  COLLECTION: "COLLECTION",
  SALES: "SALES",
  EXECUTION: "EXECUTION",
  DECISION_FOLLOW_UP: "DECISION_FOLLOW_UP",
  MARKET: "MARKET",
  DATA_QUALITY: "DATA_QUALITY",
  GENERAL_CONTROL: "STRATEGY",
};

const RHYTHM_AREA_TO_DECISION: Record<FocusArea, ExecutiveDecisionCategory> = {
  COLLECTION: "COLLECTION",
  SALES: "SALES",
  CASH: "CASH",
  MARKET: "MARKET",
  FOLLOW_UP: "DECISION_FOLLOW_UP",
};

const AWARENESS_AREA_TO_DECISION: Record<ExecutiveAwarenessWatchArea, ExecutiveDecisionCategory> = {
  CASH: "CASH",
  COLLECTION: "COLLECTION",
  SALES: "SALES",
  MARKET: "MARKET",
  EXECUTION: "EXECUTION",
  DECISION_FOLLOW_UP: "DECISION_FOLLOW_UP",
  DATA_QUALITY: "DATA_QUALITY",
};

const PRIORITY_RANK: Record<ExecutiveDecisionPriority, number> = {
  LOW: 1,
  WATCH: 2,
  MEDIUM: 3,
  HIGH: 4,
  CRITICAL: 5,
};

const CONFIDENCE_SCORE: Record<ExecutiveDecisionConfidence, number> = {
  LOW: 35,
  MEDIUM: 65,
  HIGH: 90,
};

type DecisionCandidate = Omit<
  ExecutiveDecision,
  | "id"
  | "supportingActions"
  | "opportunities"
  | "firstAction"
  | "confidenceScore"
  | "isFallback"
> & {
  id: string;
  sourceRank: number;
  preferredFirstAction?: string | null;
  confidenceScore?: number;
  isFallback?: boolean;
};

export function buildExecutiveDecisionResult(
  input: BuildExecutiveDecisionResultInput,
): ExecutiveDecisionResult {
  const { operatingContext } = input;
  const candidates = buildDecisionCandidates(input);
  const ranked = candidates.sort(compareCandidates);
  const primaryCandidate = ranked[0] ?? buildFallbackCandidate(input);
  const primaryDecision = toDecision(primaryCandidate, input);
  const supportingDecisions = ranked
    .filter((candidate) => candidate.id !== primaryCandidate.id)
    .slice(0, MAX_SUPPORTING_DECISIONS)
    .map((candidate) => toDecision(candidate, input));

  return {
    organizationId: operatingContext.organizationId,
    generatedAt: new Date().toISOString(),
    mode: operatingContext.mode,
    primaryDecision,
    supportingDecisions,
    risks: unique([
      ...primaryDecision.risks,
      ...supportingDecisions.flatMap((decision) => decision.risks.slice(0, 1)),
    ]).slice(0, MAX_LIST_ITEMS),
    opportunities: unique([
      ...primaryDecision.opportunities,
      ...supportingDecisions.flatMap((decision) => decision.opportunities.slice(0, 1)),
    ]).slice(0, MAX_LIST_ITEMS),
    decisionSummary: buildExecutiveDecisionSummary(primaryDecision),
    promptSummary: buildExecutiveDecisionPromptSummary(primaryDecision),
    overallConfidence: primaryDecision.confidence,
    dataQualityNote:
      operatingContext.executiveAwareness?.dataQualityNote ??
      operatingContext.executiveScorecard?.dataQualityNote ??
      null,
    diagnostics: {
      failedSteps: operatingContext.diagnostics.failedSteps,
      fallbackReason: primaryDecision.isFallback ? primaryDecision.rationale : null,
    },
  };
}

function buildDecisionCandidates(
  input: BuildExecutiveDecisionResultInput,
): DecisionCandidate[] {
  return [
    ...buildOverdueDecisionCandidates(input),
    ...buildDataQualityCandidates(input),
    ...buildAlertCandidates(input, "critical"),
    ...buildForecastCandidates(input, "critical"),
    ...buildScorecardCandidates(input, "AT_RISK"),
    ...buildAlertCandidates(input, "high"),
    ...buildForecastCandidates(input, "high"),
    ...buildScorecardCandidates(input, "PRESSURED"),
    ...buildOpenDecisionCandidates(input),
    ...buildRhythmCandidates(input),
    ...buildAwarenessCandidates(input),
    ...buildGoalCandidates(input),
  ];
}

function buildOverdueDecisionCandidates(
  input: BuildExecutiveDecisionResultInput,
): DecisionCandidate[] {
  const overdue = input.operatingContext.executiveDecisionContext?.overdueCommittedDecision;
  if (!overdue) return [];

  return [
    candidate({
      id: `overdue-${overdue.id}`,
      sourceRank: 1,
      category: "DECISION_FOLLOW_UP",
      priority: "CRITICAL",
      title: `"${overdue.title}" kararinin sonucunu bugun netlestir`,
      rationale: overdue.rationale,
      preferredFirstAction:
        overdue.actionHint ?? `"${overdue.title}" kararinin sonucunu bugun netlestir.`,
      risks: ["Gecikmis karar takibi diger yonetim basliklarini dagitabilir."],
      impact: 96,
      urgency: 100,
      confidence: "HIGH",
      evidenceRefs: [`decision:${overdue.id}`],
      sourceSignals: ["Gecikmis karar takibi"],
      followUpWindow: "today",
    }),
  ];
}

function buildDataQualityCandidates(
  input: BuildExecutiveDecisionResultInput,
): DecisionCandidate[] {
  const failedSteps = input.operatingContext.diagnostics.failedSteps;
  if (failedSteps.length === 0) return [];

  return [
    candidate({
      id: "data-quality-failed-steps",
      sourceRank: 2,
      category: "DATA_QUALITY",
      priority: "CRITICAL",
      title: "Eksik veri kaynaklari netlesmeden kesin yonetim yorumu yapma",
      rationale: `Operating context adimlari eksik: ${failedSteps.slice(0, 3).join(", ")}.`,
      preferredFirstAction: "Bugun eksik veri kaynaklarini ayir ve kesin olmayan yorumlari sinirla.",
      risks: ["Eksik veri karar kalitesini dusurebilir."],
      impact: 88,
      urgency: 96,
      confidence: "LOW",
      evidenceRefs: failedSteps.map((step) => `failedStep:${step}`),
      sourceSignals: ["Eksik veri kaynagi"],
      followUpWindow: "today",
    }),
  ];
}

function buildAlertCandidates(
  input: BuildExecutiveDecisionResultInput,
  level: "critical" | "high",
): DecisionCandidate[] {
  const alerts =
    level === "critical"
      ? input.operatingContext.executiveAlerts?.criticalAlerts ?? []
      : input.operatingContext.executiveAlerts?.highAlerts ?? [];

  return alerts.map((alert) =>
    candidate({
      id: `alert-${level}-${alert.id}`,
      sourceRank: level === "critical" ? 3 : 6,
      category: ALERT_CATEGORY_TO_DECISION[alert.category],
      priority: level === "critical" ? "CRITICAL" : "HIGH",
      title: alert.headline,
      rationale: alert.headline,
      preferredFirstAction: alert.actionableStep,
      risks: [alert.headline],
      impact: level === "critical" ? 92 : 82,
      urgency: level === "critical" ? 92 : 82,
      confidence: "HIGH",
      evidenceRefs: [`alert:${alert.id}`],
      sourceSignals: [level === "critical" ? "Kritik uyari" : "Yuksek onemli uyari"],
      followUpWindow: level === "critical" ? "today" : "within 48 hours",
    }),
  );
}

function buildForecastCandidates(
  input: BuildExecutiveDecisionResultInput,
  level: "critical" | "high",
): DecisionCandidate[] {
  const signals = (input.operatingContext.executiveForecast?.signals ?? []).filter((signal) =>
    level === "critical" ? signal.riskLevel === "CRITICAL" : signal.riskLevel === "HIGH",
  );

  return signals.map((signal) =>
    candidate({
      id: `forecast-${level}-${signal.riskType}`,
      sourceRank: level === "critical" ? 4 : 7,
      category: FORECAST_TYPE_TO_DECISION[signal.riskType],
      priority: level === "critical" ? "CRITICAL" : "HIGH",
      title: signal.headline,
      rationale: signal.explanation,
      preferredFirstAction: signal.actionableStep,
      risks: [signal.headline],
      impact: level === "critical" ? 90 : 78,
      urgency: level === "critical" ? 88 : 76,
      confidence: signal.confidence,
      confidenceScore: signal.confidenceScore,
      evidenceRefs: signal.evidence.map((item) => `${item.source}:${item.dataPoint}`),
      sourceSignals: [level === "critical" ? "Kritik tahmin sinyali" : "Yuksek tahmin sinyali"],
      followUpWindow: level === "critical" ? "today" : "within 48 hours",
    }),
  );
}

function buildScorecardCandidates(
  input: BuildExecutiveDecisionResultInput,
  level: "AT_RISK" | "PRESSURED",
): DecisionCandidate[] {
  const scorecard = input.operatingContext.executiveScorecard;
  if (!scorecard) return [];

  return scorecard.areas
    .filter((area) => area.level === level)
    .map((area) =>
      candidate({
        id: `scorecard-${level}-${area.area}`,
        sourceRank: level === "AT_RISK" ? 5 : 8,
        category: SCORECARD_AREA_TO_DECISION[area.area],
        priority: level === "AT_RISK" ? "HIGH" : "MEDIUM",
        title: area.headline,
        rationale: area.drivers[0] ?? area.headline,
        preferredFirstAction: area.recommendedAttention,
        risks: area.drivers.length > 0 ? area.drivers : [area.headline],
        impact: level === "AT_RISK" ? 88 : 72,
        urgency: level === "AT_RISK" ? 78 : 62,
        confidence: area.confidence,
        evidenceRefs: area.evidence,
        sourceSignals: ["Scorecard zayif alan"],
        followUpWindow: level === "AT_RISK" ? "today" : "within 48 hours",
      }),
    );
}

function buildOpenDecisionCandidates(
  input: BuildExecutiveDecisionResultInput,
): DecisionCandidate[] {
  const openDecisions = input.operatingContext.executiveDecisionContext?.openDecisions ?? [];
  if (openDecisions.length === 0) return [];

  const top = openDecisions[0]!;
  return [
    candidate({
      id: "open-decisions",
      sourceRank: 9,
      category: "DECISION_FOLLOW_UP",
      priority: "MEDIUM",
      title: `${openDecisions.length} acik yonetim kararini takipten cikar`,
      rationale: top.rationale,
      preferredFirstAction: top.actionHint,
      risks: ["Acik kararlar sahiplik ve takip tarihi olmadan suruklenebilir."],
      impact: openDecisions.length >= 2 ? 74 : 64,
      urgency: openDecisions.length >= 2 ? 70 : 58,
      confidence: "HIGH",
      evidenceRefs: openDecisions.map((decision) => `decision:${decision.id}`),
      sourceSignals: ["Acik karar kaydi"],
      followUpWindow: "within 48 hours",
    }),
  ];
}

function buildRhythmCandidates(
  input: BuildExecutiveDecisionResultInput,
): DecisionCandidate[] {
  return (input.operatingContext.executiveRhythm?.priorities ?? []).map((priority) =>
    candidate({
      id: `rhythm-${priority.rank}-${priority.focusArea}`,
      sourceRank: 10,
      category: RHYTHM_AREA_TO_DECISION[priority.focusArea],
      priority: priority.urgency === "TODAY" ? "MEDIUM" : "WATCH",
      title: priority.headline,
      rationale: priority.focus,
      preferredFirstAction: priority.actionHint,
      risks: [priority.headline],
      impact: priority.rank === 1 ? 58 : 46,
      urgency: priority.urgency === "TODAY" ? 65 : 42,
      confidence: "MEDIUM",
      evidenceRefs: [`rhythm:${priority.rank}`],
      sourceSignals: ["Gunluk ritim onceligi"],
      followUpWindow: priority.urgency === "TODAY" ? "today" : "this week",
    }),
  );
}

function buildAwarenessCandidates(
  input: BuildExecutiveDecisionResultInput,
): DecisionCandidate[] {
  const awareness = input.operatingContext.executiveAwareness;
  if (!awareness) return [];

  return awareness.watchAreas.map((area) =>
    candidate({
      id: `awareness-${area}`,
      sourceRank: 11,
      category: AWARENESS_AREA_TO_DECISION[area],
      priority: awareness.businessPosture === "AT_RISK" ? "MEDIUM" : "WATCH",
      title: `${categoryLabel(AWARENESS_AREA_TO_DECISION[area])} alanini yonetim radarinda tut`,
      rationale: awareness.negativeDrivers[0] ?? awareness.managementImplication,
      preferredFirstAction: awareness.recommendedAttention[0],
      risks: awareness.negativeDrivers.slice(0, 2),
      impact: awareness.businessPosture === "AT_RISK" ? 62 : 42,
      urgency: awareness.businessPosture === "AT_RISK" ? 58 : 35,
      confidence: awareness.confidence,
      evidenceRefs: awareness.evidence,
      sourceSignals: ["Yonetim farkindalik alani"],
      followUpWindow: "this week",
    }),
  );
}

function buildGoalCandidates(
  input: BuildExecutiveDecisionResultInput,
): DecisionCandidate[] {
  const goal = input.operatingContext.goalIntelligence;
  if (!goal || goal.readiness === "STRONG") return [];

  const isAbsent = goal.readiness === "ABSENT";
  const resolverQuestion =
    input.resolverDecision?.source === "GOAL" && input.resolverDecision.shouldAskNow
      ? input.resolverDecision.finalQuestion
      : null;

  return [
    candidate({
      id: `goal-${goal.readiness}`,
      sourceRank: 12,
      category: "STRATEGY",
      priority: isAbsent ? "WATCH" : "LOW",
      title: "Ana hedef netligini karar kalitesi icin tamamla",
      rationale: goal.promptLine ?? "Hedef sinyalleri karar kalitesi icin yeterince guclu degil.",
      preferredFirstAction: resolverQuestion ?? "Bugun ana hedefi ve karar kriterini netlestir.",
      risks: ["Hedef net degilse operasyonel oncelikler kolay dagilabilir."],
      impact: isAbsent ? 46 : 34,
      urgency: isAbsent ? 32 : 22,
      confidence: "MEDIUM",
      evidenceRefs: goal.criticalMissing.map((item) => `goal:${item}`),
      sourceSignals: ["Hedef hazirlik sinyali"],
      followUpWindow: "this week",
    }),
  ];
}

function buildFallbackCandidate(
  input: BuildExecutiveDecisionResultInput,
): DecisionCandidate {
  const focus = input.operatingContext.executiveFocus?.primaryFocus;
  const category = focus ? FOCUS_AREA_TO_DECISION[focus.focusArea] : "STRATEGY";

  return candidate({
    id: "fallback-general-control",
    sourceRank: 99,
    category,
    priority: "LOW",
    title: `${categoryLabel(category)} tarafinda kisa yonetim kontrolu yap`,
    rationale: "Belirgin ve guvenilir tek karar sinyali olusmadi.",
    preferredFirstAction: focus?.firstMove,
    risks: ["Sinyal zayifken karar fazla kesin yorumlanabilir."],
    impact: 25,
    urgency: 20,
    confidence: "LOW",
    evidenceRefs: [],
    sourceSignals: ["Fallback yonetim kontrolu"],
    followUpWindow: "this week",
    isFallback: true,
  });
}

function toDecision(
  candidateInput: DecisionCandidate,
  input: BuildExecutiveDecisionResultInput,
): ExecutiveDecision {
  const firstAction =
    resolveFirstAction(candidateInput.category, input, candidateInput.preferredFirstAction) ??
    defaultFirstAction(candidateInput.category);
  const confidenceScore =
    candidateInput.confidenceScore ?? CONFIDENCE_SCORE[candidateInput.confidence];

  return {
    id: candidateInput.id,
    category: candidateInput.category,
    priority: candidateInput.priority,
    title: candidateInput.title,
    rationale: candidateInput.rationale,
    firstAction,
    supportingActions: buildSupportingActions(candidateInput.category, firstAction, input),
    opportunities: buildOpportunities(candidateInput.category),
    risks: unique(candidateInput.risks).slice(0, MAX_LIST_ITEMS),
    impact: candidateInput.impact,
    urgency: candidateInput.urgency,
    confidence: candidateInput.confidence,
    confidenceScore,
    evidenceRefs: unique(candidateInput.evidenceRefs).slice(0, MAX_LIST_ITEMS),
    sourceSignals: unique(candidateInput.sourceSignals).slice(0, MAX_LIST_ITEMS),
    followUpWindow: candidateInput.followUpWindow,
    isFallback: candidateInput.isFallback ?? false,
  };
}

function resolveFirstAction(
  category: ExecutiveDecisionCategory,
  input: BuildExecutiveDecisionResultInput,
  preferred?: string | null,
): string | null {
  const overdue = input.operatingContext.executiveDecisionContext?.overdueCommittedDecision;
  if (category === "DECISION_FOLLOW_UP" && overdue?.actionHint) return overdue.actionHint;

  const criticalAlertAction = findAlertAction(
    input.operatingContext.executiveAlerts?.criticalAlerts ?? [],
    category,
  );
  if (criticalAlertAction) return criticalAlertAction;

  const forecastAction = findForecastAction(
    input.operatingContext.executiveForecast?.signals.filter((signal) => signal.riskLevel === "CRITICAL") ?? [],
    category,
  );
  if (forecastAction) return forecastAction;

  const focus = input.operatingContext.executiveFocus?.primaryFocus;
  if (focus && FOCUS_AREA_TO_DECISION[focus.focusArea] === category) return focus.firstMove;

  const scorecardAction = findScorecardAction(input, category);
  if (scorecardAction) return scorecardAction;

  const rhythmAction = findRhythmAction(input, category);
  if (rhythmAction) return rhythmAction;

  const firstAttention = input.operatingContext.executiveNarrative?.firstAttention;
  if (firstAttention) return firstAttention;

  return preferred ?? null;
}

function findAlertAction(
  alerts: ExecutiveAlert[],
  category: ExecutiveDecisionCategory,
): string | null {
  return alerts.find((alert) => ALERT_CATEGORY_TO_DECISION[alert.category] === category)
    ?.actionableStep ?? null;
}

function findForecastAction(
  signals: ForecastRiskSignal[],
  category: ExecutiveDecisionCategory,
): string | null {
  return signals.find((signal) => FORECAST_TYPE_TO_DECISION[signal.riskType] === category)
    ?.actionableStep ?? null;
}

function findScorecardAction(
  input: BuildExecutiveDecisionResultInput,
  category: ExecutiveDecisionCategory,
): string | null {
  const area = input.operatingContext.executiveScorecard?.areas.find(
    (item) => SCORECARD_AREA_TO_DECISION[item.area] === category && item.recommendedAttention,
  );
  return area?.recommendedAttention ?? null;
}

function findRhythmAction(
  input: BuildExecutiveDecisionResultInput,
  category: ExecutiveDecisionCategory,
): string | null {
  const priority = input.operatingContext.executiveRhythm?.priorities.find(
    (item) => RHYTHM_AREA_TO_DECISION[item.focusArea] === category && item.actionHint,
  );
  return priority?.actionHint ?? null;
}

function buildSupportingActions(
  category: ExecutiveDecisionCategory,
  firstAction: string,
  input: BuildExecutiveDecisionResultInput,
): string[] {
  return unique([
    firstAction,
    input.operatingContext.executiveFocus?.secondaryFocus?.firstMove ?? null,
    input.operatingContext.executiveRhythm?.priorities[1]?.actionHint ?? null,
    defaultFirstAction(category),
  ])
    .filter((item) => item !== firstAction)
    .slice(0, 2);
}

function buildOpportunities(category: ExecutiveDecisionCategory): string[] {
  const map: Record<ExecutiveDecisionCategory, string> = {
    CASH: "Nakit gorunurlugu artarsa karar riski duser.",
    COLLECTION: "Tahsilat netlesirse nakit ve musteri riski birlikte azalir.",
    SALES: "Sicak teklifler netlesirse gelir tahmini guclenir.",
    EXECUTION: "Sahiplik ve tarih netlesirse icra hizi artar.",
    DECISION_FOLLOW_UP: "Acik karar kapanirsa yonetim ritmi guclenir.",
    MARKET: "Piyasa etkisi erken yansitilirsa fiyatlama ve nakit riski azalir.",
    DATA_QUALITY: "Veri netlesirse sonraki karar daha guvenilir olur.",
    STRATEGY: "Hedef netlesirse gunluk oncelikler daha isabetli siralanir.",
    PEOPLE: "Rol ve beklenti netlesirse ekip performansi daha olculebilir olur.",
    CUSTOMER: "Musteri sahipligi netlesirse guven ve gelir korunur.",
  };

  return [map[category]];
}

function candidate(input: DecisionCandidate): DecisionCandidate {
  return {
    isFallback: false,
    ...input,
  };
}

function compareCandidates(left: DecisionCandidate, right: DecisionCandidate): number {
  return (
    right.sourceRank * -1 - left.sourceRank * -1 ||
    PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority] ||
    right.urgency - left.urgency ||
    right.impact - left.impact ||
    CONFIDENCE_SCORE[right.confidence] - CONFIDENCE_SCORE[left.confidence]
  );
}

function unique<T extends string>(items: Array<T | null | undefined>): T[] {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const item of items) {
    const normalized = item?.trim();
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized as T);
  }

  return out;
}
