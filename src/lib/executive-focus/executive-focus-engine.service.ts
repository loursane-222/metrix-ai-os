import type { AlertCategory } from "@/lib/executive-alerts/executive-alert.types";
import type { ExecutiveAwarenessWatchArea } from "@/lib/executive-awareness";
import type { ExecutiveScorecardArea } from "@/lib/executive-scorecard";
import type { FocusArea } from "@/lib/executive-rhythm/executive-rhythm.types";
import type {
  BuildExecutiveFocusInput,
  ExecutiveFocus,
  ExecutiveFocusArea,
  ExecutiveFocusConfidence,
  ExecutiveFocusItem,
  ExecutiveFocusLevel,
} from "./executive-focus.types";
import {
  buildExecutiveFocusInstruction,
  buildExecutiveFocusSummary,
  defaultFirstMove,
  defaultReason,
  focusAreaLabel,
} from "./executive-focus-summary.service";

const MAX_SOURCE_SIGNALS = 4;
const MAX_EVIDENCE = 8;

const LEVEL_RANK: Record<ExecutiveFocusLevel, number> = {
  NORMAL: 0,
  WATCH: 1,
  IMPORTANT: 2,
  URGENT: 3,
  BLOCKED: 4,
};

const ALERT_CATEGORY_TO_FOCUS: Record<AlertCategory, ExecutiveFocusArea> = {
  COLLECTION_PRESSURE: "COLLECTION",
  CASH_FLOW_RISK: "CASH",
  QUOTE_PIPELINE_RISK: "SALES",
  EXECUTION_GAP: "EXECUTION",
  CURRENCY_EXPOSURE: "MARKET",
  MARKET_RISK: "MARKET",
  STRATEGIC_HEALTH: "GENERAL_CONTROL",
};

const SCORECARD_AREA_TO_FOCUS: Record<ExecutiveScorecardArea, ExecutiveFocusArea> = {
  CASH_HEALTH: "CASH",
  COLLECTION_HEALTH: "COLLECTION",
  SALES_PIPELINE_HEALTH: "SALES",
  EXECUTION_HEALTH: "EXECUTION",
  DECISION_DISCIPLINE: "DECISION_FOLLOW_UP",
  MARKET_EXPOSURE: "MARKET",
  SIGNAL_MOMENTUM: "GENERAL_CONTROL",
  DATA_QUALITY: "DATA_QUALITY",
};

const AWARENESS_AREA_TO_FOCUS: Record<ExecutiveAwarenessWatchArea, ExecutiveFocusArea> = {
  CASH: "CASH",
  COLLECTION: "COLLECTION",
  SALES: "SALES",
  MARKET: "MARKET",
  EXECUTION: "EXECUTION",
  DECISION_FOLLOW_UP: "DECISION_FOLLOW_UP",
  DATA_QUALITY: "DATA_QUALITY",
};

const RHYTHM_AREA_TO_FOCUS: Record<FocusArea, ExecutiveFocusArea> = {
  COLLECTION: "COLLECTION",
  SALES: "SALES",
  CASH: "CASH",
  MARKET: "MARKET",
  FOLLOW_UP: "DECISION_FOLLOW_UP",
};

type FocusCandidate = {
  focusArea: ExecutiveFocusArea;
  focusLevel: ExecutiveFocusLevel;
  weight: number;
  reasons: UniqueList;
  firstMoves: UniqueList;
  sourceSignals: UniqueList;
  evidence: UniqueList;
  confidence: ExecutiveFocusConfidence;
};

export function buildExecutiveFocus(input: BuildExecutiveFocusInput): ExecutiveFocus {
  const failedSteps = input.failedSteps ?? [];
  const candidateMap = new Map<ExecutiveFocusArea, FocusCandidate>();
  const evidence = new UniqueList(MAX_EVIDENCE);

  if (failedSteps.length > 0 || lacksCoreSignals(input)) {
    addCandidate(candidateMap, {
      focusArea: failedSteps.length > 0 ? "DATA_QUALITY" : "GENERAL_CONTROL",
      focusLevel: failedSteps.length > 0 ? "BLOCKED" : "WATCH",
      weight: failedSteps.length > 0 ? 120 : 45,
      reason: failedSteps.length > 0
        ? "Eksik veri kaynaklari bugunku okumanin guvenini sinirliyor."
        : "Bugun belirgin tek odak icin yeterli guvenilir sinyal yok.",
      firstMove: failedSteps.length > 0
        ? "Once eksik veri kaynaklarini ayir ve kesin olmayan yorumlari sinirla."
        : "Nakit, satis ve tahsilat basliklarini kisa bir kontrol turundan gecir.",
      sourceSignal: failedSteps.length > 0
        ? `Eksik kaynaklar: ${failedSteps.slice(0, 3).join(", ")}`
        : "Ana sinyaller sinirli",
      confidence: "LOW",
    });
  }

  collectDecisionCandidates(input, candidateMap);
  collectAlertCandidates(input, candidateMap);
  collectForecastCandidates(input, candidateMap);
  collectScorecardCandidates(input, candidateMap);
  collectAwarenessCandidates(input, candidateMap);
  collectRhythmCandidates(input, candidateMap);
  collectTrendCandidates(input, candidateMap);
  collectNarrativeSignals(input, candidateMap);

  for (const candidate of candidateMap.values()) {
    for (const item of candidate.evidence.values) evidence.add(item);
  }

  const ranked = [...candidateMap.values()].sort(compareCandidates);
  const primaryCandidate =
    ranked[0] ??
    createCandidate({
      focusArea: "GENERAL_CONTROL",
      focusLevel: "NORMAL",
      weight: 10,
      reason: defaultReason("GENERAL_CONTROL"),
      firstMove: defaultFirstMove("GENERAL_CONTROL"),
      sourceSignal: "Rutin kontrol",
      confidence: "LOW",
    });

  const hasConflict = ranked.length > 1 && ranked[1].weight >= primaryCandidate.weight - 15;
  const primaryFocus = toFocusItem(primaryCandidate, hasConflict);
  const secondaryFocus = ranked[1] ? toFocusItem(ranked[1], false) : null;
  const watchOnly = ranked
    .slice(2)
    .map((candidate) => candidate.focusArea)
    .filter((area) => area !== primaryFocus.focusArea && area !== secondaryFocus?.focusArea)
    .slice(0, 2);
  const deferredAreas = buildDeferredAreas(ranked, primaryFocus, secondaryFocus, watchOnly);

  return {
    generatedAt: new Date().toISOString(),
    primaryFocus,
    secondaryFocus,
    watchOnly,
    deferredAreas,
    focusSummary: buildExecutiveFocusSummary({
      primaryFocus,
      secondaryFocus,
      hasConflict,
    }),
    managementInstruction: buildExecutiveFocusInstruction({
      primaryFocus,
      secondaryFocus,
    }),
    confidence: resolveOverallConfidence(primaryFocus, failedSteps, input),
    evidence: evidence.values,
  };
}

function collectDecisionCandidates(
  input: BuildExecutiveFocusInput,
  candidates: Map<ExecutiveFocusArea, FocusCandidate>,
): void {
  const overdue = input.executiveDecisionContext?.overdueCommittedDecision;
  if (overdue) {
    addCandidate(candidates, {
      focusArea: "DECISION_FOLLOW_UP",
      focusLevel: "BLOCKED",
      weight: 130,
      reason: `"${overdue.title}" kararinin sonucu bekliyor; bu netlesmeden diger basliklar dagilabilir.`,
      firstMove: `"${overdue.title}" kararinin sonucunu bugun netlestir.`,
      sourceSignal: "Gecikmis karar takibi",
      confidence: "HIGH",
    });
  }

  const openDecisions = input.executiveDecisionContext?.openDecisions ?? [];
  if (openDecisions.length > 0) {
    addCandidate(candidates, {
      focusArea: "DECISION_FOLLOW_UP",
      focusLevel: "IMPORTANT",
      weight: openDecisions.length >= 2 ? 75 : 60,
      reason: `${openDecisions.length} acik yonetim karari takip bekliyor.`,
      firstMove: openDecisions[0]?.actionHint ?? "Acik kararlar icin sahiplik ve takip tarihi netlestir.",
      sourceSignal: "Acik karar kaydi",
      confidence: "HIGH",
    });
  }
}

function collectAlertCandidates(
  input: BuildExecutiveFocusInput,
  candidates: Map<ExecutiveFocusArea, FocusCandidate>,
): void {
  for (const alert of input.executiveAlerts?.criticalAlerts ?? []) {
    addCandidate(candidates, {
      focusArea: ALERT_CATEGORY_TO_FOCUS[alert.category],
      focusLevel: "URGENT",
      weight: 105,
      reason: alert.headline,
      firstMove: alert.actionableStep ?? defaultFirstMove(ALERT_CATEGORY_TO_FOCUS[alert.category]),
      sourceSignal: "Kritik uyari",
      confidence: "HIGH",
    });
  }

  for (const alert of input.executiveAlerts?.highAlerts ?? []) {
    addCandidate(candidates, {
      focusArea: ALERT_CATEGORY_TO_FOCUS[alert.category],
      focusLevel: "IMPORTANT",
      weight: 80,
      reason: alert.headline,
      firstMove: alert.actionableStep ?? defaultFirstMove(ALERT_CATEGORY_TO_FOCUS[alert.category]),
      sourceSignal: "Yuksek onemli uyari",
      confidence: "HIGH",
    });
  }
}

function collectForecastCandidates(
  input: BuildExecutiveFocusInput,
  candidates: Map<ExecutiveFocusArea, FocusCandidate>,
): void {
  for (const signal of input.executiveForecast?.signals ?? []) {
    if (signal.riskLevel !== "CRITICAL" && signal.riskLevel !== "HIGH") continue;
    const focusArea = forecastTypeToFocusArea(signal.riskType);
    addCandidate(candidates, {
      focusArea,
      focusLevel: signal.riskLevel === "CRITICAL" ? "URGENT" : "IMPORTANT",
      weight: signal.riskLevel === "CRITICAL" ? 95 : 70,
      reason: signal.headline,
      firstMove: signal.actionableStep ?? defaultFirstMove(focusArea),
      sourceSignal: `${signal.riskLevel === "CRITICAL" ? "Kritik" : "Yuksek"} tahmin sinyali`,
      confidence: signal.confidence === "HIGH" ? "HIGH" : "MEDIUM",
    });
  }
}

function collectScorecardCandidates(
  input: BuildExecutiveFocusInput,
  candidates: Map<ExecutiveFocusArea, FocusCandidate>,
): void {
  const weakestArea = input.executiveScorecard?.weakestArea;
  if (!weakestArea) return;

  const area = input.executiveScorecard?.areas.find((item) => item.area === weakestArea);
  const focusArea = SCORECARD_AREA_TO_FOCUS[weakestArea];
  addCandidate(candidates, {
    focusArea,
    focusLevel: scorecardLevelToFocusLevel(area?.level),
    weight: area?.level === "AT_RISK" ? 90 : area?.level === "PRESSURED" ? 70 : 45,
    reason: area?.drivers[0] ?? `${focusAreaLabel(focusArea)} bugunku en zayif alan gorunuyor.`,
    firstMove: area?.recommendedAttention ?? defaultFirstMove(focusArea),
    sourceSignal: "En zayif saglik alani",
    confidence: input.executiveScorecard?.confidence ?? "MEDIUM",
  });
}

function collectAwarenessCandidates(
  input: BuildExecutiveFocusInput,
  candidates: Map<ExecutiveFocusArea, FocusCandidate>,
): void {
  for (const area of input.executiveAwareness?.watchAreas ?? []) {
    const focusArea = AWARENESS_AREA_TO_FOCUS[area];
    addCandidate(candidates, {
      focusArea,
      focusLevel: input.executiveAwareness?.businessPosture === "AT_RISK"
        ? "URGENT"
        : input.executiveAwareness?.businessPosture === "PRESSURED"
          ? "IMPORTANT"
          : "WATCH",
      weight: 35,
      reason: input.executiveAwareness?.negativeDrivers[0] ?? defaultReason(focusArea),
      firstMove: input.executiveAwareness?.recommendedAttention[0] ?? defaultFirstMove(focusArea),
      sourceSignal: "Yonetim izleme alani",
      confidence: input.executiveAwareness?.confidence ?? "MEDIUM",
    });
  }
}

function collectRhythmCandidates(
  input: BuildExecutiveFocusInput,
  candidates: Map<ExecutiveFocusArea, FocusCandidate>,
): void {
  for (const priority of input.executiveRhythm?.priorities ?? []) {
    const focusArea = RHYTHM_AREA_TO_FOCUS[priority.focusArea];
    addCandidate(candidates, {
      focusArea,
      focusLevel: priority.urgency === "TODAY" ? "IMPORTANT" : "WATCH",
      weight: priority.rank === 1 ? 30 : 20,
      reason: priority.headline,
      firstMove: priority.actionHint ?? defaultFirstMove(focusArea),
      sourceSignal: "Gunluk oncelik adayi",
      confidence: "MEDIUM",
    });
  }
}

function collectTrendCandidates(
  input: BuildExecutiveFocusInput,
  candidates: Map<ExecutiveFocusArea, FocusCandidate>,
): void {
  const trend = input.signalTrendContext;
  if (!trend?.hasData) return;
  if (trend.trendDirection !== "RISING" && trend.currentRiskLevel !== "CRITICAL") return;

  addCandidate(candidates, {
    focusArea: "GENERAL_CONTROL",
    focusLevel: trend.currentRiskLevel === "CRITICAL" ? "URGENT" : "IMPORTANT",
    weight: trend.currentRiskLevel === "CRITICAL" ? 80 : 45,
    reason: "Risk sinyalleri yukseliyor; bugun genel yonetim kontrolu gerekli.",
    firstMove: "Bugun en riskli alanlari kisa bir kontrol turuyla sirala.",
    sourceSignal: "Risk momentumu",
    confidence: "MEDIUM",
  });
}

function collectNarrativeSignals(
  input: BuildExecutiveFocusInput,
  candidates: Map<ExecutiveFocusArea, FocusCandidate>,
): void {
  const firstAttention = input.executiveNarrative?.firstAttention;
  if (!firstAttention || candidates.size === 0) return;
  const top = [...candidates.values()].sort(compareCandidates)[0];
  top.firstMoves.add(firstAttention);
  top.sourceSignals.add("Yonetici anlatimi");
}

function addCandidate(
  candidates: Map<ExecutiveFocusArea, FocusCandidate>,
  input: {
    focusArea: ExecutiveFocusArea;
    focusLevel: ExecutiveFocusLevel;
    weight: number;
    reason: string;
    firstMove: string;
    sourceSignal: string;
    confidence: ExecutiveFocusConfidence;
  },
): void {
  const existing = candidates.get(input.focusArea);
  const candidate = existing ?? createCandidate(input);

  if (existing) {
    candidate.weight += input.weight;
    candidate.focusLevel = higherLevel(candidate.focusLevel, input.focusLevel);
    candidate.confidence = higherConfidence(candidate.confidence, input.confidence);
    candidate.reasons.add(input.reason);
    candidate.firstMoves.add(input.firstMove);
    candidate.sourceSignals.add(input.sourceSignal);
    candidate.evidence.add(`${input.sourceSignal}: ${input.reason}`);
  }

  candidates.set(input.focusArea, candidate);
}

function createCandidate(input: {
  focusArea: ExecutiveFocusArea;
  focusLevel: ExecutiveFocusLevel;
  weight: number;
  reason: string;
  firstMove: string;
  sourceSignal: string;
  confidence: ExecutiveFocusConfidence;
}): FocusCandidate {
  const reasons = new UniqueList(MAX_SOURCE_SIGNALS);
  const firstMoves = new UniqueList(MAX_SOURCE_SIGNALS);
  const sourceSignals = new UniqueList(MAX_SOURCE_SIGNALS);
  const evidence = new UniqueList(MAX_SOURCE_SIGNALS);
  reasons.add(input.reason);
  firstMoves.add(input.firstMove);
  sourceSignals.add(input.sourceSignal);
  evidence.add(`${input.sourceSignal}: ${input.reason}`);

  return {
    focusArea: input.focusArea,
    focusLevel: input.focusLevel,
    weight: input.weight,
    reasons,
    firstMoves,
    sourceSignals,
    evidence,
    confidence: input.confidence,
  };
}

function toFocusItem(candidate: FocusCandidate, hasConflict: boolean): ExecutiveFocusItem {
  const conflictText = hasConflict
    ? " Birden fazla alan sinyal veriyor; bu alan bugun ilk siraya alinmali."
    : "";

  return {
    focusArea: candidate.focusArea,
    focusLevel: candidate.focusLevel,
    reason: `${candidate.reasons.values[0] ?? defaultReason(candidate.focusArea)}${conflictText}`,
    firstMove: candidate.firstMoves.values[0] ?? defaultFirstMove(candidate.focusArea),
    sourceSignals: candidate.sourceSignals.values,
    confidence: candidate.confidence,
  };
}

function buildDeferredAreas(
  ranked: FocusCandidate[],
  primaryFocus: ExecutiveFocusItem,
  secondaryFocus: ExecutiveFocusItem | null,
  watchOnly: ExecutiveFocusArea[],
): string[] {
  const active = new Set<ExecutiveFocusArea>([
    primaryFocus.focusArea,
    ...(secondaryFocus ? [secondaryFocus.focusArea] : []),
    ...watchOnly,
  ]);

  return ranked
    .map((candidate) => candidate.focusArea)
    .filter((area) => !active.has(area))
    .slice(0, 3)
    .map((area) => `${focusAreaLabel(area)} bugun ikinci planda kalabilir.`);
}

function compareCandidates(left: FocusCandidate, right: FocusCandidate): number {
  return (
    right.weight - left.weight ||
    LEVEL_RANK[right.focusLevel] - LEVEL_RANK[left.focusLevel]
  );
}

function higherLevel(
  left: ExecutiveFocusLevel,
  right: ExecutiveFocusLevel,
): ExecutiveFocusLevel {
  return LEVEL_RANK[right] > LEVEL_RANK[left] ? right : left;
}

function higherConfidence(
  left: ExecutiveFocusConfidence,
  right: ExecutiveFocusConfidence,
): ExecutiveFocusConfidence {
  const rank: Record<ExecutiveFocusConfidence, number> = {
    LOW: 0,
    MEDIUM: 1,
    HIGH: 2,
  };
  return rank[right] > rank[left] ? right : left;
}

function scorecardLevelToFocusLevel(level: string | null | undefined): ExecutiveFocusLevel {
  if (level === "AT_RISK") return "URGENT";
  if (level === "PRESSURED") return "IMPORTANT";
  if (level === "WATCH") return "WATCH";
  return "NORMAL";
}

function forecastTypeToFocusArea(type: string): ExecutiveFocusArea {
  if (type === "CASH_FLOW") return "CASH";
  if (type === "COLLECTION_RISK") return "COLLECTION";
  if (type === "QUOTE_CONVERSION") return "SALES";
  if (type === "CURRENCY_RISK") return "MARKET";
  if (type === "EXECUTION_RISK") return "EXECUTION";
  return "GENERAL_CONTROL";
}

function resolveOverallConfidence(
  primaryFocus: ExecutiveFocusItem,
  failedSteps: string[],
  input: BuildExecutiveFocusInput,
): ExecutiveFocusConfidence {
  if (failedSteps.length > 0 || lacksCoreSignals(input)) return "LOW";
  return primaryFocus.confidence;
}

function lacksCoreSignals(input: BuildExecutiveFocusInput): boolean {
  return !input.executiveAwareness && !input.executiveScorecard && !input.executiveRhythm;
}

class UniqueList {
  private readonly seen = new Set<string>();
  readonly values: string[] = [];

  constructor(private readonly max: number) {}

  add(value: string | null | undefined): void {
    const normalized = value?.trim();
    if (!normalized || this.values.length >= this.max) return;

    const key = normalized.toLocaleLowerCase("tr-TR");
    if (this.seen.has(key)) return;

    this.seen.add(key);
    this.values.push(normalized);
  }
}
