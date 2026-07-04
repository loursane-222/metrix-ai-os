import type {
  FinancialHealthIntelligence,
  FinancialHealthPromptSummary,
} from "./financial-health-intelligence.types";

export function buildFinancialHealthPromptSummary(
  intelligence: FinancialHealthIntelligence,
): FinancialHealthPromptSummary {
  return {
    financialHealthLevel: intelligence.financialHealthLevel,
    cashPressureLevel: intelligence.cashPressureLevel,
    collectionCoverageRatio: intelligence.collectionCoverageRatio,
    monthlyBurnRate: intelligence.monthlyBurnRate,
    cashPerformanceLevel: intelligence.cashPerformanceLevel,
    topRiskWarnings: intelligence.riskWarnings.slice(0, 3),
    topRecommendedActions: intelligence.recommendedActions.slice(0, 3),
    executiveSummary: intelligence.executiveSummary,
    confidence: intelligence.confidence,
  };
}
