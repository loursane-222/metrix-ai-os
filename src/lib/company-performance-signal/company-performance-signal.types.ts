import type { ExecutiveScorecard } from "@/lib/executive-scorecard";
import type { FinancialHealthIntelligence } from "@/lib/financial-health-intelligence";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { ExecutiveAwareness } from "@/lib/executive-awareness";
import type { CustomerHealthIntelligence } from "@/lib/customer-health-intelligence";
import type { ExecutiveGoalIntelligence } from "@/lib/executive-goal-intelligence";

export type CompanyPerformanceLevel =
  | "STRONG"
  | "STABLE"
  | "PRESSURED"
  | "CRITICAL";

export type CompanyPerformanceMomentum =
  | "ACCELERATING"
  | "STABLE"
  | "DECELERATING"
  | "UNKNOWN";

export type CompanyPerformanceSignalConfidence =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export type CompanyPerformanceComponentScores = {
  operational: number | null;
  financial: number | null;
  forwardRisk: number | null;
  goalProgress: number | null;
  customerHealth: number | null;
};

export type CompanyPerformanceSignal = {
  generatedAt: string;
  overallScore: number;
  performanceLevel: CompanyPerformanceLevel;
  momentum: CompanyPerformanceMomentum;
  primaryRisk: string | null;
  primaryStrength: string | null;
  executiveSummary: string;
  confidence: CompanyPerformanceSignalConfidence;
  componentScores: CompanyPerformanceComponentScores;
  dataGaps: string[];
};

export type CompanyPerformanceSignalPromptSummary = {
  performanceLevel: CompanyPerformanceLevel;
  momentum: CompanyPerformanceMomentum;
  primaryRisk: string | null;
  primaryStrength: string | null;
  executiveSummary: string;
  confidence: CompanyPerformanceSignalConfidence;
};

export type BuildCompanyPerformanceSignalInput = {
  executiveScorecard: ExecutiveScorecard | null;
  financialHealthIntelligence: FinancialHealthIntelligence | null;
  executiveForecast: ExecutiveForecast | null;
  executiveAwareness: ExecutiveAwareness | null;
  customerHealthIntelligence: CustomerHealthIntelligence | null;
  goalIntelligence: ExecutiveGoalIntelligence | null;
};
