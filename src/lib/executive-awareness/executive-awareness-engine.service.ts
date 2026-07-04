import type {
  BuildExecutiveAwarenessInput,
  ExecutiveAwareness,
  ExecutiveAwarenessConfidence,
  ExecutiveAwarenessDirection,
  ExecutiveAwarenessWatchArea,
  ExecutiveBusinessPosture,
} from "./executive-awareness.types";
import type { AlertCategory } from "@/lib/executive-alerts/executive-alert.types";
import type { ForecastRiskSignal, ForecastRiskType } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { FocusArea } from "@/lib/executive-rhythm/executive-rhythm.types";
import {
  buildExecutiveAwarenessDataQualityNote,
  buildExecutiveAwarenessManagementImplication,
  buildExecutiveAwarenessNarrative,
  buildExecutiveAwarenessRecommendedAttention,
} from "./executive-awareness-summary.service";

const MAX_DRIVERS = 5;
const MAX_EVIDENCE = 8;

const ALERT_CATEGORY_TO_WATCH_AREA: Record<AlertCategory, ExecutiveAwarenessWatchArea[]> = {
  COLLECTION_PRESSURE: ["COLLECTION", "CASH"],
  CASH_FLOW_RISK: ["CASH"],
  QUOTE_PIPELINE_RISK: ["SALES"],
  EXECUTION_GAP: ["EXECUTION", "COLLECTION"],
  CURRENCY_EXPOSURE: ["MARKET", "CASH"],
  MARKET_RISK: ["MARKET"],
  STRATEGIC_HEALTH: ["EXECUTION"],
};

const FORECAST_TYPE_TO_WATCH_AREA: Record<ForecastRiskType, ExecutiveAwarenessWatchArea[]> = {
  COLLECTION_RISK: ["COLLECTION", "CASH"],
  CASH_FLOW: ["CASH"],
  QUOTE_CONVERSION: ["SALES"],
  CURRENCY_RISK: ["MARKET", "CASH"],
  EXECUTION_RISK: ["EXECUTION", "COLLECTION"],
  GOAL_GAP: ["EXECUTION"],
};

const RHYTHM_FOCUS_TO_WATCH_AREA: Record<FocusArea, ExecutiveAwarenessWatchArea> = {
  COLLECTION: "COLLECTION",
  SALES: "SALES",
  CASH: "CASH",
  MARKET: "MARKET",
  FOLLOW_UP: "DECISION_FOLLOW_UP",
};

export function buildExecutiveAwareness(
  input: BuildExecutiveAwarenessInput,
): ExecutiveAwareness {
  const failedSteps = input.failedSteps ?? [];
  const watchAreas = new Set<ExecutiveAwarenessWatchArea>();
  const positiveDrivers = new UniqueList(MAX_DRIVERS);
  const negativeDrivers = new UniqueList(MAX_DRIVERS);
  const evidence = new UniqueList(MAX_EVIDENCE);

  collectForecastSignals(input, watchAreas, negativeDrivers, positiveDrivers, evidence);
  collectAlertSignals(input, watchAreas, negativeDrivers, evidence);
  collectTrendSignals(input, positiveDrivers, negativeDrivers, evidence);
  collectDecisionSignals(input, watchAreas, negativeDrivers, positiveDrivers, evidence);
  collectRhythmSignals(input, watchAreas, evidence);
  collectPaymentSignals(input, watchAreas, negativeDrivers, positiveDrivers, evidence);
  collectQuoteSignals(input, watchAreas, negativeDrivers, positiveDrivers, evidence);
  collectCollectionActionSignals(input, watchAreas, negativeDrivers, evidence);

  if (failedSteps.length > 0) {
    watchAreas.add("DATA_QUALITY");
    negativeDrivers.add("Bazi veri kaynaklari okunamadigi icin yon yorumu sinirli.");
    evidence.add(`Diagnostics failed steps: ${failedSteps.join(", ")}`);
  }

  const posture = resolveBusinessPosture(input);
  const direction = resolveDirection(input, posture);
  const confidence = resolveConfidence(input, failedSteps, evidence.values);
  const sortedWatchAreas = sortWatchAreas([...watchAreas]);
  const dataQualityNote = buildExecutiveAwarenessDataQualityNote(failedSteps);

  return {
    overallDirection: confidence === "LOW" && lacksCoreSignals(input) ? "UNKNOWN" : direction,
    businessPosture: posture,
    confidence,
    primaryNarrative: buildExecutiveAwarenessNarrative({
      direction: confidence === "LOW" && lacksCoreSignals(input) ? "UNKNOWN" : direction,
      posture,
      confidence,
      watchAreas: sortedWatchAreas,
      topNegativeDriver: negativeDrivers.values[0] ?? null,
      topPositiveDriver: positiveDrivers.values[0] ?? null,
    }),
    positiveDrivers: positiveDrivers.values,
    negativeDrivers: negativeDrivers.values,
    watchAreas: sortedWatchAreas,
    managementImplication: buildExecutiveAwarenessManagementImplication({
      direction: confidence === "LOW" && lacksCoreSignals(input) ? "UNKNOWN" : direction,
      posture,
      watchAreas: sortedWatchAreas,
    }),
    recommendedAttention: buildExecutiveAwarenessRecommendedAttention({
      direction: confidence === "LOW" && lacksCoreSignals(input) ? "UNKNOWN" : direction,
      posture,
      watchAreas: sortedWatchAreas,
    }),
    dataQualityNote,
    evidence: evidence.values,
  };
}

function collectForecastSignals(
  input: BuildExecutiveAwarenessInput,
  watchAreas: Set<ExecutiveAwarenessWatchArea>,
  negativeDrivers: UniqueList,
  positiveDrivers: UniqueList,
  evidence: UniqueList,
): void {
  const forecast = input.executiveForecast;
  if (!forecast) return;

  evidence.add(`Forecast overall risk: ${forecast.overallRiskLevel} / ${forecast.overallConfidence}`);

  if (forecast.overallRiskLevel === "LOW") {
    positiveDrivers.add("Tahmin katmani belirgin yuksek risk gostermiyor.");
  } else if (forecast.overallRiskLevel === "WATCH") {
    negativeDrivers.add("Tahmin katmani izleme gerektiren risk sinyalleri uretiyor.");
  } else {
    negativeDrivers.add(forecast.executiveSummary);
  }

  for (const signal of forecast.signals) {
    addWatchAreas(watchAreas, FORECAST_TYPE_TO_WATCH_AREA[signal.riskType]);
    addForecastDriver(signal, negativeDrivers, evidence);
  }
}

function addForecastDriver(
  signal: ForecastRiskSignal,
  negativeDrivers: UniqueList,
  evidence: UniqueList,
): void {
  if (signal.riskLevel === "LOW") return;
  negativeDrivers.add(signal.headline);
  evidence.add(`Forecast ${signal.riskType}: ${signal.riskLevel}`);
}

function collectAlertSignals(
  input: BuildExecutiveAwarenessInput,
  watchAreas: Set<ExecutiveAwarenessWatchArea>,
  negativeDrivers: UniqueList,
  evidence: UniqueList,
): void {
  const alerts = input.executiveAlerts;
  if (!alerts) return;

  evidence.add(`Alerts: ${alerts.criticalAlerts.length} critical, ${alerts.highAlerts.length} high, ${alerts.watchAlerts.length} watch`);

  const visibleAlerts = [
    ...alerts.criticalAlerts,
    ...alerts.highAlerts,
    ...alerts.watchAlerts,
  ];

  for (const alert of visibleAlerts) {
    addWatchAreas(watchAreas, ALERT_CATEGORY_TO_WATCH_AREA[alert.category]);
    if (alert.severity === "WATCH") continue;
    negativeDrivers.add(alert.headline);
  }
}

function collectTrendSignals(
  input: BuildExecutiveAwarenessInput,
  positiveDrivers: UniqueList,
  negativeDrivers: UniqueList,
  evidence: UniqueList,
): void {
  const trend = input.signalTrendContext;
  if (!trend?.hasData) return;

  evidence.add(`Signal trend: ${trend.trendDirection}, current risk ${trend.currentRiskLevel ?? "UNKNOWN"}`);

  if (trend.trendDirection === "RISING") {
    negativeDrivers.add("Son sinyal trendi riskin yukseldigini gosteriyor.");
  } else if (trend.trendDirection === "DECLINING") {
    positiveDrivers.add("Son sinyal trendinde risk dususu goruluyor.");
  } else if (trend.trendDirection === "STABLE") {
    positiveDrivers.add("Son sinyal trendi stabil seyrediyor.");
  }

  if (trend.lastEscalation) {
    negativeDrivers.add(`Son risk yukselisi ${trend.lastEscalation.daysAgo} gun once kaydedildi.`);
  }
}

function collectDecisionSignals(
  input: BuildExecutiveAwarenessInput,
  watchAreas: Set<ExecutiveAwarenessWatchArea>,
  negativeDrivers: UniqueList,
  positiveDrivers: UniqueList,
  evidence: UniqueList,
): void {
  const decisionContext = input.executiveDecisionContext;
  if (!decisionContext) return;

  const openCount = decisionContext.openDecisions.length;
  const hasOverdue = decisionContext.overdueCommittedDecision !== null;

  if (openCount > 0 || hasOverdue) {
    watchAreas.add("DECISION_FOLLOW_UP");
    evidence.add(`Decision follow-up: ${openCount} open, overdue ${hasOverdue ? "yes" : "no"}`);
  }

  if (hasOverdue) {
    negativeDrivers.add(`Gecikmis karar takibi var: ${decisionContext.overdueCommittedDecision!.title}`);
  } else if (openCount > 0) {
    negativeDrivers.add(`${openCount} acik yonetim karari takip bekliyor.`);
  }

  if (decisionContext.latestOutcome?.outcome === "SUCCESS") {
    positiveDrivers.add(`Son karar sonucu basarili: ${decisionContext.latestOutcome.decisionTitle}`);
  }
}

function collectRhythmSignals(
  input: BuildExecutiveAwarenessInput,
  watchAreas: Set<ExecutiveAwarenessWatchArea>,
  evidence: UniqueList,
): void {
  const rhythm = input.executiveRhythm;
  if (!rhythm?.hasPriorities) return;

  evidence.add(`Executive rhythm primary focus: ${rhythm.primaryFocusArea ?? "none"}`);
  for (const priority of rhythm.priorities) {
    watchAreas.add(RHYTHM_FOCUS_TO_WATCH_AREA[priority.focusArea]);
  }
}

function collectPaymentSignals(
  input: BuildExecutiveAwarenessInput,
  watchAreas: Set<ExecutiveAwarenessWatchArea>,
  negativeDrivers: UniqueList,
  positiveDrivers: UniqueList,
  evidence: UniqueList,
): void {
  const payment = input.paymentIntelligence;
  if (!payment) return;

  evidence.add(`Payment risk: ${payment.cashRiskLevel}, collection pressure ${payment.collectionPressure}`);

  if (payment.cashRiskLevel === "HIGH" || payment.cashRiskLevel === "CRITICAL") {
    watchAreas.add("CASH");
    watchAreas.add("COLLECTION");
    negativeDrivers.add(payment.executiveSummary);
  } else if (payment.hasActiveRisk || payment.collectionPressure !== "LOW") {
    watchAreas.add("COLLECTION");
    negativeDrivers.add(payment.executiveSummary);
  } else {
    positiveDrivers.add("Tahsilat ve nakit riskinde aktif yuksek baski gorunmuyor.");
  }
}

function collectQuoteSignals(
  input: BuildExecutiveAwarenessInput,
  watchAreas: Set<ExecutiveAwarenessWatchArea>,
  negativeDrivers: UniqueList,
  positiveDrivers: UniqueList,
  evidence: UniqueList,
): void {
  const quote = input.quoteIntelligence;
  if (!quote) return;

  evidence.add(`Quote risk: ${quote.quoteRiskLevel}, stale ${quote.staleQuoteCount}, hot ${quote.hotQuoteCount}`);

  if (quote.quoteRiskLevel === "HIGH" || quote.quoteRiskLevel === "CRITICAL") {
    watchAreas.add("SALES");
    negativeDrivers.add(quote.executiveSummary);
  } else if (quote.staleQuoteCount > 0) {
    watchAreas.add("SALES");
    negativeDrivers.add(`${quote.staleQuoteCount} teklif uzun suredir hareketsiz.`);
  } else if (quote.hotQuoteCount > 0 || quote.hasActiveOpportunity) {
    positiveDrivers.add(quote.executiveSummary);
  }
}

function collectCollectionActionSignals(
  input: BuildExecutiveAwarenessInput,
  watchAreas: Set<ExecutiveAwarenessWatchArea>,
  negativeDrivers: UniqueList,
  evidence: UniqueList,
): void {
  const collection = input.collectionActionContext;
  if (!collection) return;

  const staleOpen = collection.items.filter((item) => item.status === "OPEN" && item.daysOpen >= 7);
  if (staleOpen.length === 0) return;

  watchAreas.add("COLLECTION");
  watchAreas.add("EXECUTION");
  negativeDrivers.add(`${staleOpen.length} tahsilat aksiyonu 7+ gundur takip bekliyor.`);
  evidence.add(`Collection stale actions: ${staleOpen.length}`);
}

function resolveBusinessPosture(input: BuildExecutiveAwarenessInput): ExecutiveBusinessPosture {
  if (hasCriticalPressure(input)) return "AT_RISK";
  if (hasHighPressure(input)) return "PRESSURED";
  if (hasWatchPressure(input)) return "WATCH";
  return "HEALTHY";
}

function resolveDirection(
  input: BuildExecutiveAwarenessInput,
  posture: ExecutiveBusinessPosture,
): ExecutiveAwarenessDirection {
  if (hasCriticalPressure(input)) return "CRITICAL";

  const trend = input.signalTrendContext;
  if (trend?.hasData && trend.trendDirection === "RISING") return "DETERIORATING";
  if (posture === "PRESSURED" || posture === "AT_RISK") return "DETERIORATING";

  if (
    trend?.hasData &&
    trend.trendDirection === "DECLINING" &&
    !hasHighPressure(input) &&
    !hasOverdueDecision(input)
  ) {
    return "IMPROVING";
  }

  if (trend?.hasData || input.executiveForecast || input.executiveAlerts) return "STABLE";
  return "UNKNOWN";
}

function resolveConfidence(
  input: BuildExecutiveAwarenessInput,
  failedSteps: string[],
  evidence: string[],
): ExecutiveAwarenessConfidence {
  if (failedSteps.length > 0 || lacksCoreSignals(input)) return "LOW";
  if (evidence.length >= 4 && input.signalTrendContext?.hasData) return "HIGH";
  return "MEDIUM";
}

function hasCriticalPressure(input: BuildExecutiveAwarenessInput): boolean {
  return (
    input.executiveForecast?.overallRiskLevel === "CRITICAL" ||
    (input.executiveAlerts?.criticalAlerts.length ?? 0) > 0 ||
    input.paymentIntelligence?.cashRiskLevel === "CRITICAL" ||
    input.quoteIntelligence?.quoteRiskLevel === "CRITICAL"
  );
}

function hasHighPressure(input: BuildExecutiveAwarenessInput): boolean {
  return (
    input.executiveForecast?.overallRiskLevel === "HIGH" ||
    (input.executiveAlerts?.highAlerts.length ?? 0) > 0 ||
    input.paymentIntelligence?.cashRiskLevel === "HIGH" ||
    input.quoteIntelligence?.quoteRiskLevel === "HIGH"
  );
}

function hasWatchPressure(input: BuildExecutiveAwarenessInput): boolean {
  return (
    input.executiveForecast?.overallRiskLevel === "WATCH" ||
    (input.executiveAlerts?.watchAlerts.length ?? 0) > 0 ||
    input.paymentIntelligence?.hasActiveRisk === true ||
    (input.quoteIntelligence?.staleQuoteCount ?? 0) > 0 ||
    (input.collectionActionContext?.items.length ?? 0) > 0 ||
    (input.executiveDecisionContext?.openDecisions.length ?? 0) > 0
  );
}

function hasOverdueDecision(input: BuildExecutiveAwarenessInput): boolean {
  return input.executiveDecisionContext?.overdueCommittedDecision !== null &&
    input.executiveDecisionContext?.overdueCommittedDecision !== undefined;
}

function lacksCoreSignals(input: BuildExecutiveAwarenessInput): boolean {
  return !input.executiveForecast || !input.executiveAlerts;
}

function addWatchAreas(
  watchAreas: Set<ExecutiveAwarenessWatchArea>,
  areas: ExecutiveAwarenessWatchArea[],
): void {
  for (const area of areas) {
    watchAreas.add(area);
  }
}

function sortWatchAreas(areas: ExecutiveAwarenessWatchArea[]): ExecutiveAwarenessWatchArea[] {
  const order: Record<ExecutiveAwarenessWatchArea, number> = {
    DATA_QUALITY: 0,
    DECISION_FOLLOW_UP: 1,
    CASH: 2,
    COLLECTION: 3,
    SALES: 4,
    MARKET: 5,
    EXECUTION: 6,
  };

  return areas.sort((a, b) => order[a] - order[b]);
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
