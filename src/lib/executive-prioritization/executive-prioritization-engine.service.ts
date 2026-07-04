import type { ExecutiveScorecardArea, ExecutiveScorecardLevel } from "@/lib/executive-scorecard/executive-scorecard.types";
import type { ForecastRiskLevel } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { CompanyPerformanceLevel } from "@/lib/company-performance-signal/company-performance-signal.types";
import type {
  ExecutiveIgnoreItem,
  ExecutivePrioritizationInput,
  ExecutivePrioritizationResult,
  ExecutivePriorityConfidence,
  ExecutivePriorityLevel,
  ExecutivePriorityMove,
  ExecutivePriorityUrgency,
  ExecutiveTopPriority,
} from "./executive-prioritization.types";

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const WEIGHTS = {
  impact:          0.25,
  urgency:         0.20,
  riskSeverity:    0.20,
  trendPressure:   0.15,
  strategicGap:    0.15,
  timeSensitivity: 0.05,
} as const;

const AREA_LABEL: Record<ExecutiveScorecardArea, string> = {
  CASH_HEALTH:           "Nakit sağlığı",
  COLLECTION_HEALTH:     "Tahsilat",
  SALES_PIPELINE_HEALTH: "Satış pipeline",
  EXECUTION_HEALTH:      "İcra",
  DECISION_DISCIPLINE:   "Karar disiplini",
  MARKET_EXPOSURE:       "Piyasa",
  SIGNAL_MOMENTUM:       "Sinyal trendi",
  DATA_QUALITY:          "Veri kalitesi",
};

type ScoreComponents = {
  impact:          number;
  urgency:         number;
  riskSeverity:    number;
  trendPressure:   number;
  strategicGap:    number;
  timeSensitivity: number;
};

type MoveCandidate = {
  area:             string;
  action:           string;
  urgency:          ExecutivePriorityUrgency;
  sourceSignals:    string[];
  weight:           number;
  specificTarget:   string | null;
  riskIfIgnored:    string | null;
  concreteNextStep: string | null;
};

// ─── Ana Fonksiyon ────────────────────────────────────────────────────────────

export function buildExecutivePrioritizationResult(
  input: ExecutivePrioritizationInput,
): ExecutivePrioritizationResult {
  const confidence        = resolveConfidence(input);
  const scores            = computeScores(input);
  const rawScore          = computeWeightedScore(scores);
  const finalScore        = applyConfidenceMultiplier(rawScore, confidence);
  const overallPriorityLevel = resolvePriorityLevel(finalScore);
  const primaryRiskArea   = input.executiveScorecard?.weakestArea ?? null;
  const evidence          = buildEvidence(input, scores);

  const topExecutivePriority =
    overallPriorityLevel !== "IGNORE_FOR_NOW"
      ? buildTopPriority(input, finalScore, confidence, evidence, overallPriorityLevel, primaryRiskArea)
      : null;

  return {
    organizationId:       input.organizationId,
    generatedAt:          new Date().toISOString(),
    topExecutivePriority,
    topExecutiveMoves:    buildTopMoves(input, overallPriorityLevel, primaryRiskArea),
    ignoreForNow:         buildIgnoreList(input, primaryRiskArea),
    overallPriorityLevel,
    primaryRiskArea,
    confidence,
  };
}

// ─── Confidence ──────────────────────────────────────────────────────────────

function resolveConfidence(input: ExecutivePrioritizationInput): ExecutivePriorityConfidence {
  const sc = input.executiveScorecard?.confidence ?? null;
  const fc = input.executiveForecast?.overallConfidence ?? null;

  if (!input.executiveScorecard && !input.executiveForecast) return "LOW";
  if (sc === "LOW" || fc === "LOW") return "LOW";
  if (sc === "HIGH" && fc === "HIGH") return "HIGH";
  return "MEDIUM";
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function computeScores(input: ExecutivePrioritizationInput): ScoreComponents {
  return {
    impact:          scoreImpact(input),
    urgency:         scoreUrgency(input),
    riskSeverity:    scoreRiskSeverity(input),
    trendPressure:   scoreTrendPressure(input),
    strategicGap:    scoreStrategicGap(input),
    timeSensitivity: scoreTimeSensitivity(input),
  };
}

function scoreImpact(input: ExecutivePrioritizationInput): number {
  const level = input.executiveScorecard?.overallLevel;
  if (!level) return 0.3;
  const map: Record<ExecutiveScorecardLevel, number> = {
    AT_RISK:   1.0,
    PRESSURED: 0.75,
    WATCH:     0.5,
    HEALTHY:   0.0,
    UNKNOWN:   0.3,
  };
  return map[level];
}

function scoreUrgency(input: ExecutivePrioritizationInput): number {
  const level = input.executiveForecast?.overallRiskLevel;
  if (!level) return 0.3;
  const map: Record<ForecastRiskLevel, number> = {
    CRITICAL: 1.0,
    HIGH:     0.75,
    WATCH:    0.5,
    LOW:      0.0,
  };
  return map[level];
}

function scoreRiskSeverity(input: ExecutivePrioritizationInput): number {
  const cps = input.companyPerformanceSignal;
  if (!cps || cps.confidence === "LOW") return 0.3;
  const map: Record<CompanyPerformanceLevel, number> = {
    CRITICAL:  1.0,
    PRESSURED: 0.75,
    STABLE:    0.3,
    STRONG:    0.0,
  };
  return map[cps.performanceLevel];
}

function scoreTrendPressure(input: ExecutivePrioritizationInput): number {
  const dir = input.outcomeAggregate?.trend?.direction;
  if (!dir) return 0.3;
  const map: Record<"IMPROVING" | "STABLE" | "DECLINING", number> = {
    DECLINING: 1.0,
    STABLE:    0.5,
    IMPROVING: 0.0,
  };
  return map[dir];
}

function scoreStrategicGap(input: ExecutivePrioritizationInput): number {
  const rate = input.executiveForecast?.projection.goalAchievementRate ?? null;
  if (rate === null) return 0.3;
  if (rate < 0.6) return 1.0;
  if (rate < 0.8) return 0.6;
  if (rate < 1.0) return 0.3;
  return 0.0;
}

function scoreTimeSensitivity(input: ExecutivePrioritizationInput): number {
  const count = input.latestBriefing?.kritikItems.length ?? 0;
  if (count >= 2) return 1.0;
  if (count === 1) return 0.5;
  return 0.0;
}

function computeWeightedScore(s: ScoreComponents): number {
  return (
    s.impact          * WEIGHTS.impact +
    s.urgency         * WEIGHTS.urgency +
    s.riskSeverity    * WEIGHTS.riskSeverity +
    s.trendPressure   * WEIGHTS.trendPressure +
    s.strategicGap    * WEIGHTS.strategicGap +
    s.timeSensitivity * WEIGHTS.timeSensitivity
  );
}

function applyConfidenceMultiplier(score: number, confidence: ExecutivePriorityConfidence): number {
  return confidence === "LOW" ? score * 0.5 : score;
}

function resolvePriorityLevel(score: number): ExecutivePriorityLevel {
  if (score >= 0.75) return "CRITICAL";
  if (score >= 0.50) return "HIGH";
  if (score >= 0.30) return "WATCH";
  return "IGNORE_FOR_NOW";
}

// ─── Evidence ────────────────────────────────────────────────────────────────

function buildEvidence(input: ExecutivePrioritizationInput, _scores: ScoreComponents): string[] {
  const ev: string[] = [];

  const fl = input.executiveForecast?.overallRiskLevel;
  if (fl) ev.push(`tahmin riski: ${fl}`);

  const sl = input.executiveScorecard?.overallLevel;
  if (sl) ev.push(`scorecard: ${sl}`);

  const td = input.outcomeAggregate?.trend?.direction;
  if (td) ev.push(`karar trendi: ${td}`);

  const rate = input.executiveForecast?.projection.goalAchievementRate ?? null;
  if (rate !== null) ev.push(`hedef gerçekleşme: %${Math.round(rate * 100)}`);

  const cps = input.companyPerformanceSignal;
  if (cps && cps.confidence !== "LOW") ev.push(`şirket performansı: ${cps.performanceLevel}`);

  const kc = input.latestBriefing?.kritikItems.length ?? 0;
  if (kc > 0) ev.push(`brifing kritik sinyal: ${kc}`);

  return ev;
}

// ─── Top Priority ─────────────────────────────────────────────────────────────

function buildTopPriority(
  input: ExecutivePrioritizationInput,
  score: number,
  confidence: ExecutivePriorityConfidence,
  evidence: string[],
  level: Exclude<ExecutivePriorityLevel, "IGNORE_FOR_NOW">,
  primaryRiskArea: ExecutiveScorecardArea | null,
): ExecutiveTopPriority {
  const areaLabel = primaryRiskArea
    ? (AREA_LABEL[primaryRiskArea] ?? primaryRiskArea)
    : "Genel yönetim";

  return {
    headline:       buildHeadline(areaLabel, level, input),
    whyNow:         buildWhyNow(input),
    costOfInaction: buildCostOfInaction(areaLabel, level),
    evidence,
    score:          Math.round(score * 100) / 100,
    confidence,
  };
}

function buildHeadline(
  areaLabel: string,
  level: Exclude<ExecutivePriorityLevel, "IGNORE_FOR_NOW">,
  input: ExecutivePrioritizationInput,
): string {
  const cps = input.companyPerformanceSignal;
  if (level === "CRITICAL" && cps?.primaryRisk && cps.confidence !== "LOW") {
    return cps.primaryRisk;
  }
  if (level === "CRITICAL") {
    return `${areaLabel} bu dönemde kritik baskı altında; acil yönetim odağı gerekiyor.`;
  }
  if (level === "HIGH") {
    return `${areaLabel} yüksek risk sinyali taşıyor; bu hafta aksiyon gerekiyor.`;
  }
  return `${areaLabel} izlenmesi gereken risk sinyali gösteriyor.`;
}

function buildWhyNow(input: ExecutivePrioritizationInput): string {
  const parts: string[] = [];

  const rate = input.executiveForecast?.projection.goalAchievementRate ?? null;
  if (rate !== null && rate < 1.0) {
    parts.push(`Aylık hedefin %${Math.round(rate * 100)}'inde seyrediyoruz.`);
  }

  const fl = input.executiveForecast?.overallRiskLevel;
  if (fl === "CRITICAL" || fl === "HIGH") {
    parts.push("Tahmin riski yüksek seviyede.");
  }

  if (input.outcomeAggregate?.trend?.direction === "DECLINING") {
    parts.push("Karar başarı trendi düşüş gösteriyor.");
  }

  const kc = input.latestBriefing?.kritikItems.length ?? 0;
  if (kc > 0) {
    parts.push(`Bugün dış baskı sinyali var (${kc} kritik gelişme).`);
  }

  const cps = input.companyPerformanceSignal;
  if (cps?.momentum === "DECELERATING" && cps.confidence !== "LOW") {
    parts.push("Şirket performans ivmesi yavaşlıyor.");
  }

  return parts.length > 0 ? parts.join(" ") : "Mevcut sinyaller yönetim odağı gerektiriyor.";
}

function buildCostOfInaction(
  areaLabel: string,
  level: Exclude<ExecutivePriorityLevel, "IGNORE_FOR_NOW">,
): string {
  if (level === "CRITICAL") {
    return `${areaLabel} alanında bugün aksiyon alınmazsa kısa vadeli operasyonel ve finansal etki büyüyebilir.`;
  }
  if (level === "HIGH") {
    return `Bu hafta aksiyon gecikirse ${areaLabel} riski yönetilemez boyuta taşınabilir.`;
  }
  return `${areaLabel} sinyalini ihmal etmek ileride daha büyük yönetim yükü yaratabilir.`;
}

// ─── Top Moves ────────────────────────────────────────────────────────────────

const FORECAST_RISK_TYPE_AREA: Record<string, string> = {
  COLLECTION_RISK:  "Tahsilat",
  QUOTE_CONVERSION: "Satış",
  CASH_FLOW:        "Nakit",
  CURRENCY_RISK:    "Piyasa",
  EXECUTION_RISK:   "İcra",
  GOAL_GAP:         "Hedef",
};

const FORECAST_RISK_LEVEL_ORDER: Record<string, number> = {
  CRITICAL: 3,
  HIGH:     2,
  WATCH:    1,
  LOW:      0,
};

function buildTopMoves(
  input: ExecutivePrioritizationInput,
  level: ExecutivePriorityLevel,
  primaryRiskArea: ExecutiveScorecardArea | null,
): ExecutivePriorityMove[] {
  const candidates: MoveCandidate[] = [];

  // 1. Scorecard zayıf alan
  if (primaryRiskArea) {
    const areaResult = input.executiveScorecard?.areas.find((a) => a.area === primaryRiskArea);
    const action =
      areaResult?.recommendedAttention ??
      `${AREA_LABEL[primaryRiskArea]} alanındaki riski netleştir ve kısa vadeli aksiyon planı oluştur.`;
    candidates.push({
      area:             AREA_LABEL[primaryRiskArea],
      action,
      urgency:          level === "CRITICAL" ? "TODAY" : "THIS_WEEK",
      sourceSignals:    ["executiveScorecard.weakestArea"],
      weight:           3.0,
      specificTarget:   null,
      riskIfIgnored:    `${AREA_LABEL[primaryRiskArea]} alanındaki risk yönetilemez boyuta taşınabilir.`,
      concreteNextStep: action,
    });
  }

  // 2. Hedef açığı
  const rate    = input.executiveForecast?.projection.goalAchievementRate ?? null;
  const goalGap = input.executiveForecast?.projection.goalGap ?? null;
  if (rate !== null && rate < 0.8) {
    const gapStr = goalGap ? ` (açık: ₺${Math.round(goalGap).toLocaleString("tr-TR")})` : "";
    const goalAction = `Aylık gelir hedefine ulaşmak için açığı kapatacak aksiyonu bu hafta netleştir${gapStr}.`;
    const goalRisk = goalGap
      ? `₺${Math.round(goalGap).toLocaleString("tr-TR")} hedef açığı bu ay kapanmayabilir.`
      : "Aylık gelir hedefine ulaşılamayabilir.";
    candidates.push({
      area:             "Hedef",
      action:           goalAction,
      urgency:          rate < 0.6 ? "TODAY" : "THIS_WEEK",
      sourceSignals:    ["executiveForecast.goalAchievementRate"],
      weight:           rate < 0.6 ? 2.8 : 2.0,
      specificTarget:   "Aylık gelir hedefi",
      riskIfIgnored:    goalRisk,
      concreteNextStep: goalAction,
    });
  }

  // 3. Forecast en yüksek risk sinyali (GOAL_GAP hariç, zaten üstte)
  const topForecastSignal =
    input.executiveForecast?.signals
      .filter((s) => s.riskType !== "GOAL_GAP" && (s.riskLevel === "CRITICAL" || s.riskLevel === "HIGH"))
      .sort((a, b) => (FORECAST_RISK_LEVEL_ORDER[b.riskLevel] ?? 0) - (FORECAST_RISK_LEVEL_ORDER[a.riskLevel] ?? 0))[0] ??
    null;
  if (topForecastSignal?.actionableStep) {
    const forecastTarget =
      topForecastSignal.riskType === "COLLECTION_RISK" ? "Tahsilat" :
      topForecastSignal.riskType === "QUOTE_CONVERSION" ? "Satış pipeline" :
      null;
    const forecastRisk =
      topForecastSignal.riskLevel === "CRITICAL"
        ? `${FORECAST_RISK_TYPE_AREA[topForecastSignal.riskType] ?? "Tahmin"} riski kritik seviyede; gecikmesi durumunda nakit akışı olumsuz etkilenebilir.`
        : `${FORECAST_RISK_TYPE_AREA[topForecastSignal.riskType] ?? "Tahmin"} riski bu hafta yönetilmezse büyüyebilir.`;
    candidates.push({
      area:             FORECAST_RISK_TYPE_AREA[topForecastSignal.riskType] ?? "Tahmin",
      action:           topForecastSignal.actionableStep,
      urgency:          topForecastSignal.riskLevel === "CRITICAL" ? "TODAY" : "THIS_WEEK",
      sourceSignals:    [`executiveForecast.${topForecastSignal.riskType}`],
      weight:           topForecastSignal.riskLevel === "CRITICAL" ? 2.5 : 1.5,
      specificTarget:   forecastTarget,
      riskIfIgnored:    forecastRisk,
      concreteNextStep: topForecastSignal.actionableStep,
    });
  }

  // 4. Karar disiplini trendi düşüyorsa
  if (input.outcomeAggregate?.trend?.direction === "DECLINING") {
    const decisionAction = "Karar takip ritmini güçlendir; başarısız olan kararların ortak örüntüsünü ekiple incele.";
    candidates.push({
      area:             "Karar disiplini",
      action:           decisionAction,
      urgency:          "THIS_WEEK",
      sourceSignals:    ["outcomeAggregate.trend.DECLINING"],
      weight:           1.5,
      specificTarget:   "Karar takip ritmi",
      riskIfIgnored:    "Karar başarı trendi düşmeye devam edebilir.",
      concreteNextStep: decisionAction,
    });
  }

  // 5. Riskli müşteriler
  const atRiskCustomers = input.customerPortfolioIntelligence?.atRiskCustomers ?? [];
  const atRiskCount = atRiskCustomers.length;
  if (atRiskCount > 0) {
    const topAtRisk = atRiskCustomers[0];
    const customerTarget = topAtRisk?.displayName ?? null;

    const isPassive = topAtRisk?.customerStatus === "PASSIVE" || topAtRisk?.customerStatus === "BLOCKED";
    const balancePart = topAtRisk?.balanceCents !== null && topAtRisk?.balanceCents !== undefined && topAtRisk.balanceCents > 0
      ? `, kayıtlı bakiye: ₺${Math.round(topAtRisk.balanceCents / 100).toLocaleString("tr-TR")}`
      : "";
    const statusPart = isPassive ? " [pasif müşteri — tahsilat odaklı]" : "";

    const customerRisk = topAtRisk?.totalOverdue
      ? `₺${Math.round(topAtRisk.totalOverdue).toLocaleString("tr-TR")} gecikmiş tahsilat bu ay kapanmayabilir${balancePart}${statusPart}.`
      : atRiskCount > 1
        ? `${atRiskCount} riskli müşteri takipsiz kalırsa tahsilat kaybı büyüyebilir.`
        : null;
    const customerNextStep = customerTarget
      ? isPassive
        ? `${customerTarget} pasif müşteri — tahsilat görüşmesini bu hafta planla.`
        : `${customerTarget} için tahsilat ve ilişki durumunu bu hafta netleştir.`
      : `${atRiskCount} riskli müşteri için tahsilat ve ilişki takibini bu hafta güncelle.`;
    candidates.push({
      area:             "Müşteri",
      action:           `${atRiskCount} riskli müşteri için tahsilat ve ilişki takibini bu hafta güncelle.`,
      urgency:          "THIS_WEEK",
      sourceSignals:    ["customerPortfolioIntelligence.atRiskCustomers"],
      weight:           1.0,
      specificTarget:   customerTarget,
      riskIfIgnored:    customerRisk,
      concreteNextStep: customerNextStep,
    });
  }

  // 6. Şirket performansı birincil riski
  const cps = input.companyPerformanceSignal;
  if (
    cps?.primaryRisk &&
    cps.confidence !== "LOW" &&
    (cps.performanceLevel === "CRITICAL" || cps.performanceLevel === "PRESSURED")
  ) {
    const cpsAction = `Öncelikli risk: ${cps.primaryRisk}. Kısa vadeli düzeltme adımını netleştir.`;
    candidates.push({
      area:             "Şirket performansı",
      action:           cpsAction,
      urgency:          cps.performanceLevel === "CRITICAL" ? "TODAY" : "THIS_WEEK",
      sourceSignals:    ["companyPerformanceSignal.primaryRisk"],
      weight:           cps.performanceLevel === "CRITICAL" ? 2.0 : 1.2,
      specificTarget:   null,
      riskIfIgnored:    `${cps.primaryRisk} riski yönetilmezse şirket performansı baskı altında kalmaya devam edebilir.`,
      concreteNextStep: cpsAction,
    });
  }

  // En yüksek ağırlıklı, alan bazında tekilleştirilmiş ilk 3
  const seen = new Set<string>();
  return candidates
    .sort((a, b) => b.weight - a.weight)
    .filter((c) => {
      if (seen.has(c.area)) return false;
      seen.add(c.area);
      return true;
    })
    .slice(0, 3)
    .map((c, i) => ({
      rank:             (i + 1) as 1 | 2 | 3,
      area:             c.area,
      action:           c.action,
      urgency:          c.urgency,
      sourceSignals:    c.sourceSignals,
      specificTarget:   c.specificTarget,
      riskIfIgnored:    c.riskIfIgnored,
      concreteNextStep: c.concreteNextStep,
    }));
}

// ─── Ignore List ─────────────────────────────────────────────────────────────

function buildIgnoreList(
  input: ExecutivePrioritizationInput,
  primaryRiskArea: ExecutiveScorecardArea | null,
): ExecutiveIgnoreItem[] {
  const items: ExecutiveIgnoreItem[] = [];

  for (const area of input.executiveScorecard?.areas ?? []) {
    if (area.area === primaryRiskArea) continue;
    if (area.level === "HEALTHY") {
      items.push({
        area:   AREA_LABEL[area.area],
        reason: area.headline || `${AREA_LABEL[area.area]} sağlıklı görünüyor; şimdilik izleme yeterli.`,
      });
    }
  }

  return items.slice(0, 3);
}
