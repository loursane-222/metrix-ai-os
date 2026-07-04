import { analyzeCollectionRisk } from "./collection-risk-analyzer.service";
import { analyzeQuoteForecast } from "./quote-forecast-analyzer.service";
import { analyzeCashFlow } from "./cashflow-risk-analyzer.service";
import { analyzeCurrencyRisk } from "./currency-risk-analyzer.service";
import { analyzeExecutionRisk } from "./execution-risk-analyzer.service";
import { analyzeGoalAchievement } from "./goal-achievement-analyzer.service";
import type {
  BuildExecutiveForecastInput,
  ExecutiveForecast,
  ForecastRiskLevel,
  ForecastRiskSignal,
  ForecastProjection,
  ForecastConfidence,
} from "./executive-forecasting.types";

const RISK_LEVEL_ORDER: Record<ForecastRiskLevel, number> = {
  LOW: 0,
  WATCH: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export async function buildExecutiveForecast(
  input: BuildExecutiveForecastInput,
): Promise<ExecutiveForecast> {
  const signals: ForecastRiskSignal[] = [];
  let projection: ForecastProjection | null = null;

  try {
    const collectionSignal = analyzeCollectionRisk(
      input.paymentIntelligence,
      input.collectionActionContext,
    );
    if (collectionSignal) signals.push(collectionSignal);
  } catch {
    // non-fatal
  }

  try {
    const quoteSignal = analyzeQuoteForecast(
      input.quoteContext,
      input.conversionIntelligence,
    );
    if (quoteSignal) signals.push(quoteSignal);
  } catch {
    // non-fatal
  }

  try {
    const { signal: cashSignal, projection: cashProjection } = await analyzeCashFlow(
      input.organizationId,
      input.paymentContext,
      input.quoteContext,
      input.conversionIntelligence,
    );
    if (cashSignal) signals.push(cashSignal);
    projection = cashProjection;
  } catch {
    // non-fatal
  }

  try {
    const currencySignal = await analyzeCurrencyRisk(
      input.organizationId,
      input.latestBriefing,
    );
    if (currencySignal) signals.push(currencySignal);
  } catch {
    // non-fatal
  }

  try {
    const executionSignal = analyzeExecutionRisk(
      input.collectionActionContext,
      input.quoteContext,
      input.conversionIntelligence,
    );
    if (executionSignal) signals.push(executionSignal);
  } catch {
    // non-fatal
  }

  let goalProjectionFields: Partial<ForecastProjection> = {};
  try {
    const { signal: goalSignal, projectionFields } = await analyzeGoalAchievement(
      input.organizationId,
      input.goalIntelligence,
      projection,
    );
    if (goalSignal) signals.push(goalSignal);
    goalProjectionFields = projectionFields;
  } catch {
    // non-fatal
  }

  const overallRiskLevel = resolveOverallRiskLevel(signals);
  const overallConfidence = resolveOverallConfidence(signals);
  const safeProjection: ForecastProjection = {
    ...(projection ?? buildEmptyProjection()),
    ...goalProjectionFields,
  };
  const executiveSummary = buildExecutiveSummary(signals, safeProjection, overallRiskLevel);
  const dataQualityNote = buildDataQualityNote(signals, safeProjection);

  return {
    organizationId: input.organizationId,
    generatedAt: new Date().toISOString(),
    horizon: "30D",
    overallRiskLevel,
    overallConfidence,
    signals,
    projection: safeProjection,
    executiveSummary,
    dataQualityNote,
  };
}

function resolveOverallRiskLevel(signals: ForecastRiskSignal[]): ForecastRiskLevel {
  if (signals.length === 0) return "LOW";
  return signals.reduce<ForecastRiskLevel>((max, s) => {
    return RISK_LEVEL_ORDER[s.riskLevel] > RISK_LEVEL_ORDER[max] ? s.riskLevel : max;
  }, "LOW");
}

function resolveOverallConfidence(signals: ForecastRiskSignal[]): ForecastConfidence {
  if (signals.length === 0) return "LOW";
  const avg = signals.reduce((sum, s) => sum + s.confidenceScore, 0) / signals.length;
  return avg >= 0.70 ? "HIGH" : avg >= 0.45 ? "MEDIUM" : "LOW";
}

function buildEmptyProjection(): ForecastProjection {
  return {
    horizon: "30D",
    expectedCollection7d: 0,
    expectedCollection30d: 0,
    expectedRevenue30d: 0,
    bestCaseRevenue: 0,
    worstCaseRevenue: 0,
    projectedCashInflow: 0,
    confidence: "LOW",
    dataLimitations: ["Projeksiyon verisi hesaplanamadi."],
  };
}

function buildExecutiveSummary(
  signals: ForecastRiskSignal[],
  projection: ForecastProjection,
  overallRisk: ForecastRiskLevel,
): string {
  if (signals.length === 0) {
    return "Mevcut verilere gore onumüzdeki 30 gunluk tahmin icin belirgin risk sinyali tespit edilmedi.";
  }

  const highSignals = signals.filter((s) => s.riskLevel === "CRITICAL" || s.riskLevel === "HIGH");
  const watchSignals = signals.filter((s) => s.riskLevel === "WATCH");

  const parts: string[] = [];

  if (overallRisk === "CRITICAL" || overallRisk === "HIGH") {
    parts.push(`Onumüzdeki 30 gunde yuksek risk mevcut: ${highSignals.map((s) => s.headline).join(" / ")}`);
  } else if (overallRisk === "WATCH") {
    parts.push(`Takip gerektiren sinyaller: ${watchSignals.map((s) => s.headline).join(" / ")}`);
  } else {
    parts.push("Gozle gorulur risk sinyali yok; operasyon normal seyrediyor.");
  }

  if (projection.expectedCollection30d > 0) {
    parts.push(
      `30 gun icinde ₺${projection.expectedCollection30d.toLocaleString("tr-TR")} tahsilat bekleniyor.`,
    );
  }

  if (projection.bestCaseRevenue > 0) {
    parts.push(
      `Teklif pipeline'indan en iyi senaryoda ₺${projection.bestCaseRevenue.toLocaleString("tr-TR")} gelir potansiyeli var.`,
    );
  }

  return parts.join(" ");
}

function buildDataQualityNote(signals: ForecastRiskSignal[], projection: ForecastProjection): string {
  const allLimitations = new Set<string>([
    ...signals.flatMap((s) => s.dataLimitations),
    ...projection.dataLimitations,
  ]);

  if (allLimitations.size === 0) {
    return "Tahmin yeterli veri ile olusturuldu.";
  }

  const top = [...allLimitations].slice(0, 2);
  return `Veri kisitlamalari: ${top.join(" ")}`;
}
