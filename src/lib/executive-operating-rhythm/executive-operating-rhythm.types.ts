import type { ExecutivePrioritizationResult } from "@/lib/executive-prioritization";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { ExecutiveAlertBundle } from "@/lib/executive-alerts/executive-alert.types";
import type { ExecutiveDecisionContext } from "@/lib/executive-decision-loop/executive-decision-loop.types";
import type { ExecutiveScorecard } from "@/lib/executive-scorecard";
import type { CustomerPortfolioIntelligence } from "@/lib/customer-portfolio-intelligence";
import type { ExecutiveGoalIntelligence } from "@/lib/executive-goal-intelligence";
import type { CompanyPerformanceSignal } from "@/lib/company-performance-signal";
import type { BriefingPackage } from "@/lib/daily-briefing/daily-briefing.types";
import type { QuoteIntelligence } from "@/lib/core/quotes/quote-intelligence-builder";

export type OperatingHorizon = "TODAY" | "THIS_WEEK" | "THIS_MONTH";

export type OperatingRhythmItemSource =
  | "alert"
  | "forecast"
  | "prioritization"
  | "decision_outcome"
  | "customer_portfolio"
  | "goal_intelligence"
  | "scorecard"
  | "briefing"
  | "company_performance"
  | "quote"
  | "payment";

export type OperatingRhythmConfidence = "LOW" | "MEDIUM" | "HIGH";
export type OperatingRhythmPosture    = "STABLE" | "PRESSURED" | "CRITICAL";

export type OperatingRhythmItem = {
  id:                string;
  horizon:           OperatingHorizon;
  title:             string;
  description:       string;
  source:            OperatingRhythmItemSource;
  priority:          1 | 2 | 3 | 4 | 5;
  specificTarget:    string | null;
  reason:            string;
  riskIfIgnored:     string | null;
  concreteNextStep:  string | null;
  relatedCapability: string | null;
  confidence:        OperatingRhythmConfidence;
};

export type OperatingRhythmHorizonBlock = {
  headline:  string;
  objective: string;
  theme:     string;
  items:     OperatingRhythmItem[];
};

export type ExecutiveOperatingRhythm = {
  organizationId:  string;
  generatedAt:     string;
  today:           OperatingRhythmHorizonBlock;
  thisWeek:        OperatingRhythmHorizonBlock;
  thisMonth:       OperatingRhythmHorizonBlock;
  overallPosture:  OperatingRhythmPosture;
  confidence:      OperatingRhythmConfidence;
};

export type BuildExecutiveOperatingRhythmInput = {
  organizationId:                string;
  executivePriority:             ExecutivePrioritizationResult | null;
  executiveForecast:             ExecutiveForecast | null;
  executiveAlerts:               ExecutiveAlertBundle | null;
  executiveDecisionContext:      ExecutiveDecisionContext | null;
  executiveScorecard:            ExecutiveScorecard | null;
  customerPortfolioIntelligence: CustomerPortfolioIntelligence | null;
  goalIntelligence:              ExecutiveGoalIntelligence | null;
  companyPerformanceSignal:      CompanyPerformanceSignal | null;
  latestBriefing:                BriefingPackage | null;
  quoteIntelligence:             QuoteIntelligence | null;
};
