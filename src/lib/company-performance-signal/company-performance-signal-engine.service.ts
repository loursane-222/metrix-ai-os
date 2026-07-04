import type { ExecutiveAwarenessDirection } from "@/lib/executive-awareness/executive-awareness.types";
import type { ExecutiveScorecardArea, ExecutiveScorecardLevel } from "@/lib/executive-scorecard/executive-scorecard.types";
import type { ForecastRiskLevel } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { FinancialHealthLevel } from "@/lib/financial-health-intelligence";
import type {
  BuildCompanyPerformanceSignalInput,
  CompanyPerformanceComponentScores,
  CompanyPerformanceLevel,
  CompanyPerformanceMomentum,
  CompanyPerformanceSignal,
  CompanyPerformanceSignalConfidence,
} from "./company-performance-signal.types";

type ComponentWeights = {
  operational: number;
  financial: number;
  forwardRisk: number;
  goalProgress: number;
  customerHealth: number;
};

const DEFAULT_WEIGHTS: ComponentWeights = {
  operational: 0.35,
  financial: 0.30,
  forwardRisk: 0.20,
  goalProgress: 0.10,
  customerHealth: 0.05,
};

export function buildCompanyPerformanceSignal(
  input: BuildCompanyPerformanceSignalInput,
  weights: ComponentWeights = DEFAULT_WEIGHTS,
): CompanyPerformanceSignal {
  const componentScores = computeComponentScores(input);
  const overallScore = computeWeightedScore(componentScores, weights);
  const performanceLevel = resolvePerformanceLevel(overallScore);
  const momentum = resolveMomentum(input.executiveAwareness?.overallDirection ?? null);
  const primaryRisk = resolvePrimaryRisk(componentScores, input);
  const primaryStrength = resolvePrimaryStrength(componentScores);
  const confidence = resolveConfidence(componentScores);
  const dataGaps = resolveDataGaps(input);

  return {
    generatedAt: new Date().toISOString(),
    overallScore,
    performanceLevel,
    momentum,
    primaryRisk,
    primaryStrength,
    executiveSummary: buildExecutiveSummary(performanceLevel, momentum, primaryRisk, primaryStrength),
    confidence,
    componentScores,
    dataGaps,
  };
}

function computeComponentScores(
  input: BuildCompanyPerformanceSignalInput,
): CompanyPerformanceComponentScores {
  return {
    operational: scoreOperational(input.executiveScorecard?.overallLevel ?? null),
    financial: scoreFinancial(input.financialHealthIntelligence?.financialHealthLevel ?? null),
    forwardRisk: scoreForwardRisk(input.executiveForecast?.overallRiskLevel ?? null),
    goalProgress: scoreGoalProgress(
      input.goalIntelligence?.readiness === "ABSENT"
        ? null
        : (input.executiveForecast?.projection?.goalAchievementRate ?? null),
    ),
    customerHealth: scoreCustomerHealth(input),
  };
}

function scoreOperational(level: ExecutiveScorecardLevel | null): number | null {
  if (!level) return null;
  const map: Record<ExecutiveScorecardLevel, number | null> = {
    HEALTHY: 90,
    WATCH: 65,
    PRESSURED: 40,
    AT_RISK: 15,
    UNKNOWN: null,
  };
  return map[level] ?? null;
}

function scoreFinancial(level: FinancialHealthLevel | null): number | null {
  if (!level) return null;
  const map: Record<FinancialHealthLevel, number> = {
    HIGH: 90,
    MEDIUM: 60,
    LOW: 30,
    CRITICAL: 5,
  };
  return map[level];
}

function scoreForwardRisk(level: ForecastRiskLevel | null): number | null {
  if (!level) return null;
  const map: Record<ForecastRiskLevel, number> = {
    LOW: 90,
    WATCH: 65,
    HIGH: 35,
    CRITICAL: 10,
  };
  return map[level];
}

function scoreGoalProgress(goalAchievementRate: number | null): number | null {
  if (goalAchievementRate === null) return null;
  if (goalAchievementRate >= 1.0) return 90;
  if (goalAchievementRate >= 0.75) return 65;
  if (goalAchievementRate >= 0.5) return 35;
  return 10;
}

function scoreCustomerHealth(input: BuildCompanyPerformanceSignalInput): number | null {
  const chi = input.customerHealthIntelligence;
  if (!chi) return null;

  const { distribution } = chi;
  const total =
    distribution.healthyCount +
    distribution.watchCount +
    distribution.atRiskCount +
    distribution.criticalCount;

  if (total === 0) return null;

  const weighted =
    distribution.healthyCount * 90 +
    distribution.watchCount * 65 +
    distribution.atRiskCount * 35 +
    distribution.criticalCount * 10;

  return Math.round(weighted / total);
}

function computeWeightedScore(
  scores: CompanyPerformanceComponentScores,
  weights: ComponentWeights,
): number {
  const entries = [
    { score: scores.operational, weight: weights.operational },
    { score: scores.financial, weight: weights.financial },
    { score: scores.forwardRisk, weight: weights.forwardRisk },
    { score: scores.goalProgress, weight: weights.goalProgress },
    { score: scores.customerHealth, weight: weights.customerHealth },
  ].filter((e): e is { score: number; weight: number } => e.score !== null);

  if (entries.length === 0) return 50;

  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  const weightedSum = entries.reduce((sum, e) => sum + e.score * e.weight, 0);

  return Math.round(weightedSum / totalWeight);
}

function resolvePerformanceLevel(score: number): CompanyPerformanceLevel {
  if (score >= 75) return "STRONG";
  if (score >= 50) return "STABLE";
  if (score >= 30) return "PRESSURED";
  return "CRITICAL";
}

function resolveMomentum(
  direction: ExecutiveAwarenessDirection | null,
): CompanyPerformanceMomentum {
  if (!direction) return "UNKNOWN";
  const map: Record<ExecutiveAwarenessDirection, CompanyPerformanceMomentum> = {
    IMPROVING: "ACCELERATING",
    STABLE: "STABLE",
    DETERIORATING: "DECELERATING",
    CRITICAL: "DECELERATING",
    UNKNOWN: "UNKNOWN",
  };
  return map[direction] ?? "UNKNOWN";
}

function resolvePrimaryRisk(
  scores: CompanyPerformanceComponentScores,
  input: BuildCompanyPerformanceSignalInput,
): string | null {
  const entries = (
    Object.entries(scores) as [keyof CompanyPerformanceComponentScores, number | null][]
  )
    .filter((e): e is [keyof CompanyPerformanceComponentScores, number] => e[1] !== null)
    .sort((a, b) => a[1] - b[1]);

  const worst = entries[0];
  if (!worst || worst[1] >= 60) return null;

  return translateComponentRisk(worst[0], input);
}

function translateComponentRisk(
  component: keyof CompanyPerformanceComponentScores,
  input: BuildCompanyPerformanceSignalInput,
): string {
  switch (component) {
    case "operational": {
      const area = input.executiveScorecard?.weakestArea;
      return area
        ? `Operasyonel baskı: ${translateScorecardArea(area)}`
        : "Operasyonel performans baskı altında";
    }
    case "financial":
      return "Finansal sağlık baskı altında";
    case "forwardRisk":
      return "Kısa vadeli risk yüksek";
    case "goalProgress":
      return "Hedef programı geride";
    case "customerHealth":
      return "Kritik müşteri hesapları dikkat gerektiriyor";
  }
}

function resolvePrimaryStrength(scores: CompanyPerformanceComponentScores): string | null {
  const entries = (
    Object.entries(scores) as [keyof CompanyPerformanceComponentScores, number | null][]
  )
    .filter((e): e is [keyof CompanyPerformanceComponentScores, number] => e[1] !== null)
    .sort((a, b) => b[1] - a[1]);

  const best = entries[0];
  if (!best || best[1] < 75) return null;

  return translateComponentStrength(best[0]);
}

function translateComponentStrength(
  component: keyof CompanyPerformanceComponentScores,
): string {
  const map: Record<keyof CompanyPerformanceComponentScores, string> = {
    operational: "Operasyonel denge güçlü",
    financial: "Finansal sağlık güçlü",
    forwardRisk: "Kısa vadeli risk düşük",
    goalProgress: "Hedef programı sağlam",
    customerHealth: "Müşteri portföyü sağlıklı",
  };
  return map[component];
}

function resolveConfidence(
  scores: CompanyPerformanceComponentScores,
): CompanyPerformanceSignalConfidence {
  const available = Object.values(scores).filter((v) => v !== null).length;
  if (available >= 4) return "HIGH";
  if (available >= 3) return "MEDIUM";
  return "LOW";
}

function resolveDataGaps(input: BuildCompanyPerformanceSignalInput): string[] {
  const gaps: string[] = [];
  if (!input.executiveScorecard || input.executiveScorecard.overallLevel === "UNKNOWN") {
    gaps.push("Operasyonel skor eksik");
  }
  if (!input.financialHealthIntelligence) gaps.push("Finansal sağlık verisi eksik");
  if (!input.executiveForecast) gaps.push("Öne dönük risk verisi eksik");
  if (!input.goalIntelligence || input.goalIntelligence.readiness === "ABSENT") {
    gaps.push("Hedef tanımı eksik");
  }
  if (!input.customerHealthIntelligence) gaps.push("Müşteri sağlık verisi eksik");
  return gaps;
}

function buildExecutiveSummary(
  performanceLevel: CompanyPerformanceLevel,
  momentum: CompanyPerformanceMomentum,
  primaryRisk: string | null,
  primaryStrength: string | null,
): string {
  const levelText: Record<CompanyPerformanceLevel, string> = {
    STRONG: "Şirket bu dönemde güçlü seyir izliyor",
    STABLE: "Şirket bu dönemde dengeli seyir izliyor",
    PRESSURED: "Şirket bu dönemde baskı altında",
    CRITICAL: "Şirket bu dönemde kritik baskı altında",
  };

  const momentumSuffix: Record<CompanyPerformanceMomentum, string> = {
    ACCELERATING: "; ivme artıyor",
    STABLE: "",
    DECELERATING: "; ivme yavaşlıyor",
    UNKNOWN: "",
  };

  const base = `${levelText[performanceLevel]}${momentumSuffix[momentum]}`;

  if (primaryRisk) return `${base}; öne çıkan risk: ${primaryRisk}.`;
  if (primaryStrength) return `${base}; öne çıkan güç: ${primaryStrength}.`;
  return `${base}.`;
}

function translateScorecardArea(area: ExecutiveScorecardArea): string {
  const map: Record<ExecutiveScorecardArea, string> = {
    CASH_HEALTH: "nakit sağlığı",
    COLLECTION_HEALTH: "tahsilat",
    SALES_PIPELINE_HEALTH: "satış boru hattı",
    EXECUTION_HEALTH: "icra",
    DECISION_DISCIPLINE: "karar takibi",
    MARKET_EXPOSURE: "piyasa maruziyeti",
    SIGNAL_MOMENTUM: "sinyal trendi",
    DATA_QUALITY: "veri kalitesi",
  };
  return map[area] ?? area;
}
