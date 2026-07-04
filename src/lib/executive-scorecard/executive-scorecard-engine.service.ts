import type { AlertCategory } from "@/lib/executive-alerts/executive-alert.types";
import type { ForecastRiskLevel, ForecastRiskSignal, ForecastRiskType } from "@/lib/executive-forecasting/executive-forecasting.types";
import type {
  BuildExecutiveScorecardInput,
  ExecutiveScorecard,
  ExecutiveScorecardArea,
  ExecutiveScorecardAreaResult,
  ExecutiveScorecardConfidence,
  ExecutiveScorecardLevel,
} from "./executive-scorecard.types";
import {
  buildExecutiveScorecardDataQualityNote,
  buildExecutiveScorecardSummary,
  confidenceFromEvidence,
  levelHeadline,
  recommendedAttentionForArea,
} from "./executive-scorecard-summary.service";

const MAX_ITEMS = 4;

const LEVEL_RANK: Record<ExecutiveScorecardLevel, number> = {
  HEALTHY: 0,
  WATCH: 1,
  PRESSURED: 2,
  AT_RISK: 3,
  UNKNOWN: -1,
};

const CONFIDENCE_RANK: Record<ExecutiveScorecardConfidence, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

export function buildExecutiveScorecard(
  input: BuildExecutiveScorecardInput,
): ExecutiveScorecard {
  const dataLimitations = collectDataLimitations(input);
  const areas: ExecutiveScorecardAreaResult[] = [
    buildCashHealth(input),
    buildCollectionHealth(input),
    buildSalesPipelineHealth(input),
    buildExecutionHealth(input),
    buildDecisionDiscipline(input),
    buildMarketExposure(input),
    buildSignalMomentum(input),
    buildDataQuality(input, dataLimitations),
  ];

  const overallLevel = resolveOverallLevel(areas);
  const confidence = resolveOverallConfidence(areas);
  const strongestArea = resolveStrongestArea(areas);
  const weakestArea = resolveWeakestArea(areas);
  const dataQualityArea = areas.find((area) => area.area === "DATA_QUALITY")!;

  return {
    generatedAt: new Date().toISOString(),
    overallLevel,
    confidence,
    areas,
    strongestArea,
    weakestArea,
    summary: buildExecutiveScorecardSummary({
      overallLevel,
      weakestArea,
      strongestArea,
      areas,
    }),
    dataQualityNote: buildExecutiveScorecardDataQualityNote({
      failedSteps: input.failedSteps ?? [],
      dataLimitations,
      dataQualityArea,
    }),
  };
}

function buildCashHealth(input: BuildExecutiveScorecardInput): ExecutiveScorecardAreaResult {
  const drivers = new UniqueList(MAX_ITEMS);
  const evidence = new UniqueList(MAX_ITEMS);
  const payment = input.paymentIntelligence;
  const paymentContext = input.paymentContext;
  const cashSignals = forecastSignals(input, "CASH_FLOW");
  const cashAlerts = alertCount(input, ["CASH_FLOW_RISK"]);

  if (payment) {
    evidence.add(`Payment cash risk: ${payment.cashRiskLevel}`);
    evidence.add(`Overdue ratio: ${Math.round(payment.overdueRatio * 100)}%`);
    if (payment.cashRiskLevel !== "LOW") drivers.add(payment.executiveSummary);
  }

  if (paymentContext) {
    evidence.add(`Total overdue: ${paymentContext.totalOverdue}`);
  }

  addForecastDrivers(cashSignals, drivers, evidence);
  addAlertEvidence(cashAlerts, "Cash alerts", evidence);

  const level = worstLevel([
    riskToLevel(payment?.cashRiskLevel ?? null),
    forecastLevel(cashSignals),
    alertLevel(cashAlerts),
    paymentContext && paymentContext.totalReceivable > 0 && paymentContext.totalOverdue === 0
      ? "HEALTHY"
      : "UNKNOWN",
  ]);

  return areaResult("CASH_HEALTH", level, drivers, evidence, Boolean(payment || paymentContext));
}

function buildCollectionHealth(input: BuildExecutiveScorecardInput): ExecutiveScorecardAreaResult {
  const drivers = new UniqueList(MAX_ITEMS);
  const evidence = new UniqueList(MAX_ITEMS);
  const payment = input.paymentIntelligence;
  const collection = input.collectionActionContext;
  const signals = forecastSignals(input, "COLLECTION_RISK");
  const alerts = alertCount(input, ["COLLECTION_PRESSURE"]);

  if (payment) {
    evidence.add(`Collection pressure: ${payment.collectionPressure}`);
    if (payment.collectionPressure !== "LOW" || payment.hasActiveRisk) {
      drivers.add(payment.executiveSummary);
    }
  }

  if (collection) {
    const stale = collection.items.filter((item) => item.status === "OPEN" && item.daysOpen >= 7);
    evidence.add(`Collection actions: ${collection.openCount} open, ${collection.inProgressCount} in progress`);
    if (stale.length > 0) drivers.add(`${stale.length} tahsilat aksiyonu 7+ gundur bekliyor.`);
  }

  addForecastDrivers(signals, drivers, evidence);
  addAlertEvidence(alerts, "Collection alerts", evidence);

  const staleLevel = collection
    ? collection.items.some((item) => item.status === "OPEN" && item.daysOpen >= 14)
      ? "PRESSURED"
      : collection.items.some((item) => item.status === "OPEN" && item.daysOpen >= 7)
        ? "WATCH"
        : "HEALTHY"
    : "UNKNOWN";

  const level = worstLevel([
    collectionPressureToLevel(payment?.collectionPressure ?? null),
    payment?.hasActiveRisk ? "WATCH" : "UNKNOWN",
    staleLevel,
    forecastLevel(signals),
    alertLevel(alerts),
  ]);

  return areaResult("COLLECTION_HEALTH", level, drivers, evidence, Boolean(payment || collection));
}

function buildSalesPipelineHealth(input: BuildExecutiveScorecardInput): ExecutiveScorecardAreaResult {
  const drivers = new UniqueList(MAX_ITEMS);
  const evidence = new UniqueList(MAX_ITEMS);
  const quote = input.quoteIntelligence;
  const quoteContext = input.quoteContext;
  const conversion = quote?.conversionIntelligence ?? null;
  const signals = forecastSignals(input, "QUOTE_CONVERSION");
  const alerts = alertCount(input, ["QUOTE_PIPELINE_RISK"]);

  if (quote) {
    evidence.add(`Quote risk: ${quote.quoteRiskLevel}`);
    evidence.add(`Hot/stale quotes: ${quote.hotQuoteCount}/${quote.staleQuoteCount}`);
    if (quote.quoteRiskLevel !== "LOW" || quote.staleQuoteCount > 0) {
      drivers.add(quote.executiveSummary);
    }
  }

  if (quoteContext) {
    evidence.add(`Open quote value: ${quoteContext.openTotal}`);
  }

  if (conversion) {
    evidence.add(`Conversion sample: ${conversion.totalClosed} closed, enough data ${conversion.hasEnoughData ? "yes" : "no"}`);
    if (conversion.hasEnoughData && conversion.winRate < 0.25) {
      drivers.add(`Teklif kazanma orani dusuk: %${Math.round(conversion.winRate * 100)}.`);
    }
  }

  addForecastDrivers(signals, drivers, evidence);
  addAlertEvidence(alerts, "Sales alerts", evidence);

  const conversionLevel =
    conversion && conversion.hasEnoughData
      ? conversion.winRate < 0.2
        ? "PRESSURED"
        : conversion.winRate < 0.35
          ? "WATCH"
          : "HEALTHY"
      : "UNKNOWN";

  const level = worstLevel([
    riskToLevel(quote?.quoteRiskLevel ?? null),
    conversionLevel,
    forecastLevel(signals),
    alertLevel(alerts),
    quote && quote.activeQuoteCount === 0 ? "UNKNOWN" : "UNKNOWN",
  ]);

  return areaResult("SALES_PIPELINE_HEALTH", level, drivers, evidence, Boolean(quote || quoteContext));
}

function buildExecutionHealth(input: BuildExecutiveScorecardInput): ExecutiveScorecardAreaResult {
  const drivers = new UniqueList(MAX_ITEMS);
  const evidence = new UniqueList(MAX_ITEMS);
  const collection = input.collectionActionContext;
  const signals = forecastSignals(input, "EXECUTION_RISK");
  const alerts = alertCount(input, ["EXECUTION_GAP"]);

  let actionLevel: ExecutiveScorecardLevel = "UNKNOWN";
  if (collection) {
    const stale14 = collection.items.filter((item) => item.status === "OPEN" && item.daysOpen >= 14);
    const stale7 = collection.items.filter((item) => item.status === "OPEN" && item.daysOpen >= 7);
    evidence.add(`Execution actions: ${collection.openCount} open, ${collection.inProgressCount} in progress`);
    if (stale14.length > 0) {
      actionLevel = "PRESSURED";
      drivers.add(`${stale14.length} acik aksiyon 14+ gundur bekliyor.`);
    } else if (stale7.length > 0) {
      actionLevel = "WATCH";
      drivers.add(`${stale7.length} acik aksiyon 7+ gundur bekliyor.`);
    } else {
      actionLevel = "HEALTHY";
    }
  }

  addForecastDrivers(signals, drivers, evidence);
  addAlertEvidence(alerts, "Execution alerts", evidence);

  const level = worstLevel([actionLevel, forecastLevel(signals), alertLevel(alerts)]);
  return areaResult("EXECUTION_HEALTH", level, drivers, evidence, Boolean(collection));
}

function buildDecisionDiscipline(input: BuildExecutiveScorecardInput): ExecutiveScorecardAreaResult {
  const drivers = new UniqueList(MAX_ITEMS);
  const evidence = new UniqueList(MAX_ITEMS);
  const decision = input.executiveDecisionContext;

  if (!decision) {
    return areaResult("DECISION_DISCIPLINE", "UNKNOWN", drivers, evidence, false);
  }

  const openCount = decision.openDecisions.length;
  evidence.add(`Decision follow-up: ${openCount} open, overdue ${decision.overdueCommittedDecision ? "yes" : "no"}`);

  let level: ExecutiveScorecardLevel = "HEALTHY";
  if (decision.overdueCommittedDecision) {
    level = "PRESSURED";
    drivers.add(`Gecikmis karar var: ${decision.overdueCommittedDecision.title}`);
  } else if (openCount >= 2) {
    level = "WATCH";
    drivers.add(`${openCount} acik yonetim karari takip bekliyor.`);
  } else if (openCount === 1) {
    level = "WATCH";
    drivers.add("1 acik yonetim karari takip bekliyor.");
  }

  if (decision.latestOutcome?.outcome === "FAILURE") {
    level = worstLevel([level, "PRESSURED"]);
    drivers.add(`Son karar sonucu basarisiz: ${decision.latestOutcome.decisionTitle}`);
  } else if (decision.latestOutcome?.outcome === "SUCCESS") {
    evidence.add(`Latest outcome success: ${decision.latestOutcome.decisionTitle}`);
  }

  const agg = decision.outcomeAggregate;
  if (agg && agg.confidence !== "LOW") {
    evidence.add(`Outcome aggregate (${agg.windowDays}d): total=${agg.totalClosed}, quality=${agg.qualitySignal}`);

    // riskTier is the SSOT for outcome-quality risk level
    const tier = agg.riskTier;
    if (tier?.isCriticalPattern) {
      level = worstLevel([level, "AT_RISK"]);
      drivers.add("Karar disiplini kritik: tekrarlayan basarisizlik paterni yuksek guvenle dogrulandi.");
    } else if (tier?.hasBaseRisk) {
      level = worstLevel([level, "PRESSURED"]);
      drivers.add(`Son ${agg.windowDays} gunluk karar kalitesi risk isaretiyor (basarili: ${agg.successCount}/${agg.totalClosed}).`);
    }

    // Sub-signal text: diagnostic detail only, no independent level impact
    if (agg.repeatedFailureCount >= 1) {
      drivers.add(`${agg.repeatedFailureCount} karar birden fazla kez basarisiz sonuclandi.`);
      evidence.add(`Repeated failure count: ${agg.repeatedFailureCount}`);
    }
    if (agg.reAgendaCount >= 2) {
      drivers.add(`${agg.reAgendaCount} karar yeniden gundeme alinmayi bekliyor.`);
      evidence.add(`Re-agenda count: ${agg.reAgendaCount}`);
    }

    // staleOpenCount: process discipline signal — not modelled in riskTier, kept separately
    if (agg.staleOpenCount >= 3) {
      level = worstLevel([level, "PRESSURED"]);
      drivers.add(`${agg.staleOpenCount} acik karar 3+ gundir taahhude donmedi.`);
    }

    if (agg.avgCommitToCloseDays !== null && agg.avgCommitToCloseDays > 7) {
      evidence.add(`Avg commit-to-close: ${agg.avgCommitToCloseDays} days`);
    }
  }

  return areaResult("DECISION_DISCIPLINE", level, drivers, evidence, true);
}

function buildMarketExposure(input: BuildExecutiveScorecardInput): ExecutiveScorecardAreaResult {
  const drivers = new UniqueList(MAX_ITEMS);
  const evidence = new UniqueList(MAX_ITEMS);
  const signals = forecastSignals(input, "CURRENCY_RISK");
  const alerts = alertCount(input, ["CURRENCY_EXPOSURE", "MARKET_RISK"]);
  const briefing = input.latestBriefing;

  addForecastDrivers(signals, drivers, evidence);
  addAlertEvidence(alerts, "Market alerts", evidence);

  let briefingLevel: ExecutiveScorecardLevel = "UNKNOWN";
  if (briefing) {
    const negativeCritical = briefing.kritikItems.filter(
      (item) => item.finansal_etki.yon === "NEGATIF" || item.ekonomik_etki.yon === "NEGATIF",
    );
    evidence.add(`Market briefing critical/watch: ${briefing.kritikItems.length}/${briefing.dikkatItems.length}`);
    if (negativeCritical.some((item) => item.impact_score >= 0.8)) {
      briefingLevel = "PRESSURED";
      drivers.add(negativeCritical[0]?.headline ?? null);
    } else if (negativeCritical.length > 0 || briefing.dikkatItems.length > 0) {
      briefingLevel = "WATCH";
      drivers.add((negativeCritical[0] ?? briefing.dikkatItems[0])?.headline ?? null);
    } else {
      briefingLevel = "HEALTHY";
    }
  }

  const level = worstLevel([briefingLevel, forecastLevel(signals), alertLevel(alerts)]);
  return areaResult("MARKET_EXPOSURE", level, drivers, evidence, Boolean(briefing || signals.length > 0 || alerts.total > 0));
}

function buildSignalMomentum(input: BuildExecutiveScorecardInput): ExecutiveScorecardAreaResult {
  const drivers = new UniqueList(MAX_ITEMS);
  const evidence = new UniqueList(MAX_ITEMS);
  const trend = input.signalTrendContext;

  if (!trend?.hasData) {
    return areaResult("SIGNAL_MOMENTUM", "UNKNOWN", drivers, evidence, false);
  }

  evidence.add(`Trend direction: ${trend.trendDirection}`);
  evidence.add(`Current risk: ${trend.currentRiskLevel ?? "UNKNOWN"}`);

  let level: ExecutiveScorecardLevel = "HEALTHY";
  if (trend.currentRiskLevel === "CRITICAL") {
    level = "AT_RISK";
    drivers.add("Guncel sinyal riski kritik seviyede.");
  } else if (trend.currentRiskLevel === "HIGH") {
    level = "PRESSURED";
    drivers.add("Guncel sinyal riski yuksek seviyede.");
  } else if (trend.currentRiskLevel === "WATCH") {
    level = "WATCH";
  }

  if (trend.trendDirection === "RISING") {
    level = worstLevel([level, "PRESSURED"]);
    drivers.add("Son sinyal trendi yukseliyor.");
  } else if (trend.trendDirection === "UNKNOWN") {
    level = worstLevel([level, "UNKNOWN"]);
  }

  if (trend.lastEscalation) {
    drivers.add(`Son risk yukselisi ${trend.lastEscalation.daysAgo} gun once kaydedildi.`);
  }

  return areaResult("SIGNAL_MOMENTUM", level, drivers, evidence, true);
}

function buildDataQuality(
  input: BuildExecutiveScorecardInput,
  dataLimitations: string[],
): ExecutiveScorecardAreaResult {
  const drivers = new UniqueList(MAX_ITEMS);
  const evidence = new UniqueList(MAX_ITEMS);
  const failedSteps = input.failedSteps ?? [];

  if (failedSteps.length > 0) {
    evidence.add(`Failed steps: ${failedSteps.join(", ")}`);
    drivers.add("Bazi Operating Context adimlari okunamadi.");
  }

  if (dataLimitations.length > 0) {
    evidence.add(`Data limitations: ${dataLimitations.length}`);
    drivers.add(dataLimitations[0]);
  }

  if (input.executiveForecast) {
    evidence.add(`Forecast confidence: ${input.executiveForecast.overallConfidence}`);
  }

  const hasPrimarySource = Boolean(input.executiveForecast || input.executiveAlerts);
  const level =
    failedSteps.length > 0
      ? "PRESSURED"
      : dataLimitations.length > 0 || input.executiveForecast?.overallConfidence === "LOW"
        ? "WATCH"
        : hasPrimarySource
          ? "HEALTHY"
          : "UNKNOWN";

  return areaResult(
    "DATA_QUALITY",
    level,
    drivers,
    evidence,
    hasPrimarySource,
    failedSteps.length > 0 || dataLimitations.length > 0,
  );
}

function areaResult(
  area: ExecutiveScorecardArea,
  level: ExecutiveScorecardLevel,
  drivers: UniqueList,
  evidence: UniqueList,
  hasPrimarySource: boolean,
  hasDataGap: boolean = false,
): ExecutiveScorecardAreaResult {
  return {
    area,
    level,
    confidence: confidenceFromEvidence(hasPrimarySource, evidence.values.length, hasDataGap),
    headline: levelHeadline(area, level),
    drivers: drivers.values,
    evidence: evidence.values,
    recommendedAttention: recommendedAttentionForArea(area, level),
  };
}

function forecastSignals(
  input: BuildExecutiveScorecardInput,
  type: ForecastRiskType,
): ForecastRiskSignal[] {
  return (input.executiveForecast?.signals ?? []).filter((signal) => signal.riskType === type);
}

function addForecastDrivers(
  signals: ForecastRiskSignal[],
  drivers: UniqueList,
  evidence: UniqueList,
): void {
  for (const signal of signals) {
    evidence.add(`Forecast ${signal.riskType}: ${signal.riskLevel}`);
    if (signal.riskLevel !== "LOW") drivers.add(signal.headline);
  }
}

function alertCount(
  input: BuildExecutiveScorecardInput,
  categories: AlertCategory[],
): { critical: number; high: number; watch: number; total: number } {
  const match = (category: AlertCategory) => categories.includes(category);
  const critical = (input.executiveAlerts?.criticalAlerts ?? []).filter((alert) => match(alert.category)).length;
  const high = (input.executiveAlerts?.highAlerts ?? []).filter((alert) => match(alert.category)).length;
  const watch = (input.executiveAlerts?.watchAlerts ?? []).filter((alert) => match(alert.category)).length;
  return { critical, high, watch, total: critical + high + watch };
}

function addAlertEvidence(
  alerts: { critical: number; high: number; watch: number; total: number },
  label: string,
  evidence: UniqueList,
): void {
  if (alerts.total === 0) return;
  evidence.add(`${label}: ${alerts.critical} critical, ${alerts.high} high, ${alerts.watch} watch`);
}

function riskToLevel(risk: string | null): ExecutiveScorecardLevel {
  if (risk === "CRITICAL") return "AT_RISK";
  if (risk === "HIGH") return "PRESSURED";
  if (risk === "MEDIUM" || risk === "WATCH") return "WATCH";
  if (risk === "LOW") return "HEALTHY";
  return "UNKNOWN";
}

function collectionPressureToLevel(pressure: string | null): ExecutiveScorecardLevel {
  if (pressure === "HIGH") return "PRESSURED";
  if (pressure === "MEDIUM") return "WATCH";
  if (pressure === "LOW") return "HEALTHY";
  return "UNKNOWN";
}

function forecastLevel(signals: ForecastRiskSignal[]): ExecutiveScorecardLevel {
  if (signals.length === 0) return "UNKNOWN";
  return worstLevel(signals.map((signal) => forecastRiskToLevel(signal.riskLevel)));
}

function forecastRiskToLevel(risk: ForecastRiskLevel): ExecutiveScorecardLevel {
  if (risk === "CRITICAL") return "AT_RISK";
  if (risk === "HIGH") return "PRESSURED";
  if (risk === "WATCH") return "WATCH";
  return "HEALTHY";
}

function alertLevel(alerts: { critical: number; high: number; watch: number }): ExecutiveScorecardLevel {
  if (alerts.critical > 0) return "AT_RISK";
  if (alerts.high > 0) return "PRESSURED";
  if (alerts.watch > 0) return "WATCH";
  return "UNKNOWN";
}

function worstLevel(levels: ExecutiveScorecardLevel[]): ExecutiveScorecardLevel {
  const known = levels.filter((level) => level !== "UNKNOWN");
  if (known.length === 0) return "UNKNOWN";
  return known.reduce((worst, level) =>
    LEVEL_RANK[level] > LEVEL_RANK[worst] ? level : worst,
  );
}

function resolveOverallLevel(areas: ExecutiveScorecardAreaResult[]): ExecutiveScorecardLevel {
  const known = areas.filter((area) => area.level !== "UNKNOWN");
  if (known.length === 0) return "UNKNOWN";
  return worstLevel(known.map((area) => area.level));
}

function resolveOverallConfidence(areas: ExecutiveScorecardAreaResult[]): ExecutiveScorecardConfidence {
  if (areas.every((area) => area.confidence === "LOW")) return "LOW";
  const known = areas.filter((area) => area.level !== "UNKNOWN");
  if (known.length < 4) return "LOW";
  const avg =
    known.reduce((sum, area) => sum + CONFIDENCE_RANK[area.confidence], 0) / known.length;
  return avg >= 1.5 ? "HIGH" : avg >= 0.75 ? "MEDIUM" : "LOW";
}

function resolveStrongestArea(areas: ExecutiveScorecardAreaResult[]): ExecutiveScorecardArea | null {
  const healthy = areas.find((area) => area.level === "HEALTHY" && area.confidence !== "LOW");
  return healthy?.area ?? null;
}

function resolveWeakestArea(areas: ExecutiveScorecardAreaResult[]): ExecutiveScorecardArea | null {
  const known = areas.filter((area) => area.level !== "UNKNOWN");
  if (known.length === 0) return null;
  return [...known].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])[0]?.area ?? null;
}

function collectDataLimitations(input: BuildExecutiveScorecardInput): string[] {
  const limitations = new UniqueList(MAX_ITEMS);
  const forecast = input.executiveForecast;
  if (!forecast) return limitations.values;

  if (isDataLimitation(forecast.dataQualityNote)) {
    limitations.add(forecast.dataQualityNote);
  }

  for (const signal of forecast.signals) {
    for (const limitation of signal.dataLimitations) {
      if (isDataLimitation(limitation)) {
        limitations.add(limitation);
      }
    }
  }
  for (const limitation of forecast.projection.dataLimitations) {
    if (isDataLimitation(limitation)) {
      limitations.add(limitation);
    }
  }

  return limitations.values;
}

function isDataLimitation(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLocaleLowerCase("tr-TR") ?? "";
  if (!normalized) return false;
  if (normalized.includes("yeterli veri ile")) return false;
  return (
    normalized.includes("kisit") ||
    normalized.includes("kısıt") ||
    normalized.includes("limit") ||
    normalized.includes("hesaplanam") ||
    normalized.includes("yetersiz")
  );
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
