import type { PaymentIntelligence } from "@/lib/core/payments/payment-intelligence-builder";
import type { PaymentContext } from "@/lib/core/payments/payment-context-builder";
import type { ExpenseIntelligence, ExpenseContext } from "@/lib/core/expenses";
import type { ExecutiveGoalIntelligence } from "@/lib/executive-goal-intelligence";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";

export type FinancialHealthLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type CashPressureLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type FinancialHealthConfidence = "LOW" | "MEDIUM" | "HIGH";
export type CashPerformanceLevel = "STRONG" | "STABLE" | "SOFT" | "WEAK" | "UNKNOWN";

export type FinancialHealthIntelligence = {
  financialHealthLevel: FinancialHealthLevel;
  cashPressureLevel: CashPressureLevel;
  collectionCoverageRatio: number | null;
  estimatedMonthlyCollections: number | null;
  monthlyBurnRate: number;
  monthToDateCashCollection: number | null;
  lastMonthCashCollection: number | null;
  cashCollectionGrowthRate: number | null;
  cashPerformanceLevel: CashPerformanceLevel;
  cashPerformanceScore: number | null;
  riskWarnings: string[];
  recommendedActions: string[];
  executiveSummary: string;
  confidence: FinancialHealthConfidence;
  generatedAt: string;
  version: "v2";
};

export type BuildFinancialHealthIntelligenceInput = {
  paymentIntelligence: PaymentIntelligence | null;
  paymentContext: PaymentContext | null;
  expenseIntelligence: ExpenseIntelligence | null;
  expenseContext: ExpenseContext | null;
  goalIntelligence?: ExecutiveGoalIntelligence | null;
  forecast?: ExecutiveForecast | null;
};

export type FinancialHealthPromptSummary = {
  financialHealthLevel: FinancialHealthLevel;
  cashPressureLevel: CashPressureLevel;
  collectionCoverageRatio: number | null;
  monthlyBurnRate: number;
  cashPerformanceLevel: CashPerformanceLevel;
  topRiskWarnings: string[];
  topRecommendedActions: string[];
  executiveSummary: string;
  confidence: FinancialHealthConfidence;
};
