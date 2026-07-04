import type { PaymentContext } from "@/lib/core/payments/payment-context-builder";
import type { PaymentIntelligence } from "@/lib/core/payments/payment-intelligence-builder";
import type { QuoteContext } from "@/lib/core/quotes/quote-context-builder";
import type { QuoteConversionIntelligence } from "@/lib/core/quotes/quote-conversion-intelligence-builder";
import type { CollectionActionContext } from "@/lib/core/collection-actions/collection-action-context-builder";
import type { BriefingPackage } from "@/lib/daily-briefing/daily-briefing.types";
import type { ExecutiveGoalIntelligence } from "@/lib/executive-goal-intelligence";

export type ForecastRiskLevel = "LOW" | "WATCH" | "HIGH" | "CRITICAL";
export type ForecastConfidence = "LOW" | "MEDIUM" | "HIGH";
export type ForecastHorizon = "7D" | "30D";

export type ForecastRiskType =
  | "COLLECTION_RISK"
  | "QUOTE_CONVERSION"
  | "CASH_FLOW"
  | "CURRENCY_RISK"
  | "EXECUTION_RISK"
  | "GOAL_GAP";

export type ForecastEvidence = {
  dataPoint: string;
  value: string;
  source: "payment" | "quote" | "collection_action" | "briefing" | "memory";
};

export type ForecastRiskSignal = {
  riskType: ForecastRiskType;
  riskLevel: ForecastRiskLevel;
  confidence: ForecastConfidence;
  confidenceScore: number;
  headline: string;
  explanation: string;
  actionableStep: string | null;
  evidence: ForecastEvidence[];
  dataLimitations: string[];
};

export type ForecastProjection = {
  horizon: ForecastHorizon;
  expectedCollection7d: number;
  expectedCollection30d: number;
  expectedRevenue30d: number;
  bestCaseRevenue: number;
  worstCaseRevenue: number;
  projectedCashInflow: number;
  confidence: ForecastConfidence;
  dataLimitations: string[];
  monthlyTarget?: number;
  monthToDateRevenue?: number;
  forecastedMonthEndRevenue?: number;
  goalAchievementRate?: number;
  goalGap?: number;
  // V2: gerçek tahsilat alanları (WON quote ≠ PAID payment)
  monthToDateCashCollection?: number;
  lastMonthCashCollection?: number;
  cashCollectionGrowthRate?: number | null;
};

export type ExecutiveForecast = {
  organizationId: string;
  generatedAt: string;
  horizon: ForecastHorizon;
  overallRiskLevel: ForecastRiskLevel;
  overallConfidence: ForecastConfidence;
  signals: ForecastRiskSignal[];
  projection: ForecastProjection;
  executiveSummary: string;
  dataQualityNote: string;
};

export type BuildExecutiveForecastInput = {
  organizationId: string;
  paymentContext?: PaymentContext | null;
  paymentIntelligence?: PaymentIntelligence | null;
  quoteContext?: QuoteContext | null;
  conversionIntelligence?: QuoteConversionIntelligence | null;
  collectionActionContext?: CollectionActionContext | null;
  latestBriefing?: BriefingPackage | null;
  goalIntelligence?: ExecutiveGoalIntelligence | null;
};
