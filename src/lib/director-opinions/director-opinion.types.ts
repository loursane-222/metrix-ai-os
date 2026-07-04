import type { BriefingPackage } from "@/lib/daily-briefing/daily-briefing.types";
import type { ExecutiveAlertBundle } from "@/lib/executive-alerts/executive-alert.types";
import type { ExecutiveAwareness } from "@/lib/executive-awareness";
import type { ExecutiveDecisionContext } from "@/lib/executive-decision-loop";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { ExecutiveNarrative } from "@/lib/executive-narrative";
import type { ExecutiveScorecard } from "@/lib/executive-scorecard";
import type { ExecutiveRhythm } from "@/lib/executive-rhythm/executive-rhythm.types";
import type { CollectionActionContext } from "@/lib/core/collection-actions/collection-action-context-builder";
import type { PaymentContext } from "@/lib/core/payments/payment-context-builder";
import type { PaymentIntelligence } from "@/lib/core/payments/payment-intelligence-builder";
import type { QuoteContext } from "@/lib/core/quotes/quote-context-builder";
import type { QuoteIntelligence } from "@/lib/core/quotes/quote-intelligence-builder";
import type { SignalTrendContext } from "@/lib/signal-persistence/signal-trend-context.types";

export type DirectorOpinionVersion = "v1";

export type DirectorType =
  | "FINANCE_DIRECTOR"
  | "SALES_DIRECTOR"
  | "OPERATIONS_DIRECTOR"
  | "STRATEGY_DIRECTOR"
  | "RESEARCH_DIRECTOR";

export type DirectorOpinionConfidence = "LOW" | "MEDIUM" | "HIGH";

export type DirectorOpinionUrgency =
  | "LOW"
  | "WATCH"
  | "IMPORTANT"
  | "URGENT";

export type DirectorOpinionEvidenceSource =
  | "payment_context"
  | "payment_intelligence"
  | "quote_context"
  | "quote_intelligence"
  | "collection_action"
  | "forecast"
  | "alert"
  | "decision"
  | "rhythm"
  | "awareness"
  | "scorecard"
  | "narrative"
  | "briefing"
  | "signal_trend"
  | "data_quality";

export type DirectorOpinionSignal = {
  title: string;
  detail: string;
  source: DirectorOpinionEvidenceSource;
};

export type DirectorOpinionRisk = {
  title: string;
  severity: DirectorOpinionUrgency;
  explanation: string;
};

export type DirectorOpinionOpportunity = {
  title: string;
  impact: "LOW" | "MEDIUM" | "HIGH";
  explanation: string;
};

export type DirectorOpinionAction = {
  title: string;
  rationale: string;
  urgency: DirectorOpinionUrgency;
};

export type DirectorOpinionEvidence = {
  source: DirectorOpinionEvidenceSource;
  label: string;
  value: string;
};

export type DirectorOpinion = {
  directorType: DirectorType;
  opinionTitle: string;
  executiveSummary: string;
  signals: DirectorOpinionSignal[];
  risks: DirectorOpinionRisk[];
  opportunities: DirectorOpinionOpportunity[];
  recommendedActions: DirectorOpinionAction[];
  confidence: DirectorOpinionConfidence;
  urgency: DirectorOpinionUrgency;
  evidence: DirectorOpinionEvidence[];
  generatedAt: string;
  version: DirectorOpinionVersion;
};

export type DirectorOpinionBundle = {
  organizationId: string;
  generatedAt: string;
  version: DirectorOpinionVersion;
  opinions: DirectorOpinion[];
  topConcerns: string[];
  crossFunctionalConflicts: string[];
  confidence: DirectorOpinionConfidence;
};

export type DirectorOpinionProfile = {
  directorType: DirectorType;
  title: string;
  domain: string;
  mission: string;
  signalSources: DirectorOpinionEvidenceSource[];
  riskLens: string[];
  opportunityLens: string[];
};

export type BuildDirectorOpinionsInput = {
  organizationId: string;
  paymentContext?: PaymentContext | null;
  paymentIntelligence?: PaymentIntelligence | null;
  quoteContext?: QuoteContext | null;
  quoteIntelligence?: QuoteIntelligence | null;
  collectionActionContext?: CollectionActionContext | null;
  latestBriefing?: BriefingPackage | null;
  executiveForecast?: ExecutiveForecast | null;
  executiveAlerts?: ExecutiveAlertBundle | null;
  executiveDecisionContext?: ExecutiveDecisionContext | null;
  executiveRhythm?: ExecutiveRhythm | null;
  executiveAwareness?: ExecutiveAwareness | null;
  executiveScorecard?: ExecutiveScorecard | null;
  executiveNarrative?: ExecutiveNarrative | null;
  signalTrendContext?: SignalTrendContext | null;
  failedSteps?: string[];
  now?: Date;
};
