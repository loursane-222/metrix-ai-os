import type { ExecutiveScorecardArea } from "@/lib/executive-scorecard/executive-scorecard.types";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { ExecutiveScorecard } from "@/lib/executive-scorecard/executive-scorecard.types";
import type { ExecutiveDecisionOutcomeAggregate } from "@/lib/executive-decision-loop/executive-decision-loop.types";
import type { CompanyPerformanceSignal } from "@/lib/company-performance-signal/company-performance-signal.types";
import type { CustomerPortfolioIntelligence } from "@/lib/customer-portfolio-intelligence/customer-portfolio-intelligence.types";
import type { BriefingPackage } from "@/lib/daily-briefing/daily-briefing.types";

export type ExecutivePriorityLevel = "CRITICAL" | "HIGH" | "WATCH" | "IGNORE_FOR_NOW";
export type ExecutivePriorityConfidence = "LOW" | "MEDIUM" | "HIGH";
export type ExecutivePriorityUrgency = "TODAY" | "THIS_WEEK";

export type ExecutiveTopPriority = {
  headline: string;
  whyNow: string;
  costOfInaction: string;
  evidence: string[];
  score: number;
  confidence: ExecutivePriorityConfidence;
};

export type ExecutivePriorityMove = {
  rank: 1 | 2 | 3;
  area: string;
  action: string;
  urgency: ExecutivePriorityUrgency;
  sourceSignals: string[];
  specificTarget: string | null;
  riskIfIgnored: string | null;
  concreteNextStep: string | null;
};

export type ExecutiveIgnoreItem = {
  area: string;
  reason: string;
};

export type ExecutivePrioritizationInput = {
  organizationId: string;
  executiveForecast: ExecutiveForecast | null;
  executiveScorecard: ExecutiveScorecard | null;
  outcomeAggregate: ExecutiveDecisionOutcomeAggregate | null;
  companyPerformanceSignal: CompanyPerformanceSignal | null;
  customerPortfolioIntelligence?: CustomerPortfolioIntelligence | null;
  latestBriefing?: BriefingPackage | null;
};

export type ExecutivePrioritizationResult = {
  organizationId: string;
  generatedAt: string;
  topExecutivePriority: ExecutiveTopPriority | null;
  topExecutiveMoves: ExecutivePriorityMove[];
  ignoreForNow: ExecutiveIgnoreItem[];
  overallPriorityLevel: ExecutivePriorityLevel;
  primaryRiskArea: ExecutiveScorecardArea | null;
  confidence: ExecutivePriorityConfidence;
};
