import type { ExecutiveAlertBundle } from "@/lib/executive-alerts/executive-alert.types";
import type { ExecutiveDecisionContext } from "@/lib/executive-decision-loop";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { ExecutiveRhythm } from "@/lib/executive-rhythm/executive-rhythm.types";
import type { BriefingPackage } from "@/lib/daily-briefing/daily-briefing.types";
import type { CollectionActionContext } from "@/lib/core/collection-actions/collection-action-context-builder";
import type { PaymentContext } from "@/lib/core/payments/payment-context-builder";
import type { PaymentIntelligence } from "@/lib/core/payments/payment-intelligence-builder";
import type { QuoteContext } from "@/lib/core/quotes/quote-context-builder";
import type { QuoteIntelligence } from "@/lib/core/quotes/quote-intelligence-builder";
import type { SignalTrendContext } from "@/lib/signal-persistence/signal-trend-context.types";

export type ExecutiveScorecardArea =
  | "CASH_HEALTH"
  | "COLLECTION_HEALTH"
  | "SALES_PIPELINE_HEALTH"
  | "EXECUTION_HEALTH"
  | "DECISION_DISCIPLINE"
  | "MARKET_EXPOSURE"
  | "SIGNAL_MOMENTUM"
  | "DATA_QUALITY";

export type ExecutiveScorecardLevel =
  | "HEALTHY"
  | "WATCH"
  | "PRESSURED"
  | "AT_RISK"
  | "UNKNOWN";

export type ExecutiveScorecardConfidence = "LOW" | "MEDIUM" | "HIGH";

export type ExecutiveScorecardAreaResult = {
  area: ExecutiveScorecardArea;
  level: ExecutiveScorecardLevel;
  confidence: ExecutiveScorecardConfidence;
  headline: string;
  drivers: string[];
  evidence: string[];
  recommendedAttention: string | null;
};

export type ExecutiveScorecard = {
  generatedAt: string;
  overallLevel: ExecutiveScorecardLevel;
  confidence: ExecutiveScorecardConfidence;
  areas: ExecutiveScorecardAreaResult[];
  strongestArea: ExecutiveScorecardArea | null;
  weakestArea: ExecutiveScorecardArea | null;
  summary: string;
  dataQualityNote: string | null;
};

export type BuildExecutiveScorecardInput = {
  organizationId: string;
  executiveForecast?: ExecutiveForecast | null;
  executiveAlerts?: ExecutiveAlertBundle | null;
  signalTrendContext?: SignalTrendContext | null;
  executiveDecisionContext?: ExecutiveDecisionContext | null;
  executiveRhythm?: ExecutiveRhythm | null;
  paymentContext?: PaymentContext | null;
  paymentIntelligence?: PaymentIntelligence | null;
  quoteContext?: QuoteContext | null;
  quoteIntelligence?: QuoteIntelligence | null;
  collectionActionContext?: CollectionActionContext | null;
  latestBriefing?: BriefingPackage | null;
  failedSteps?: string[];
};
