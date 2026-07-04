import type { ExecutiveAlertBundle } from "@/lib/executive-alerts/executive-alert.types";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { CollectionActionContext } from "@/lib/core/collection-actions/collection-action-context-builder";
import type { PaymentContext } from "@/lib/core/payments/payment-context-builder";
import type { PaymentIntelligence } from "@/lib/core/payments/payment-intelligence-builder";
import type { QuoteContext } from "@/lib/core/quotes/quote-context-builder";
import type { QuoteIntelligence } from "@/lib/core/quotes/quote-intelligence-builder";
import type { SignalTrendContext } from "@/lib/signal-persistence/signal-trend-context.types";
import type { ExecutiveScorecard } from "@/lib/executive-scorecard";
import type { ExecutiveCouncilSynthesis } from "@/lib/executive-council";
import type { DirectorOpinionBundle } from "@/lib/director-opinions";
import type { ExecutiveNarrative } from "@/lib/executive-narrative/executive-narrative.types";
import type { CompanyPerformanceSignal } from "@/lib/company-performance-signal";
import type { FinancialHealthIntelligence } from "@/lib/financial-health-intelligence";
import type { ExecutiveDecisionOutcomeAggregate } from "@/lib/executive-decision-loop";
import type { ExecutiveManagementReviewResult } from "@/lib/executive-management-review";

export type ReportType =
  | "EXECUTIVE_SUMMARY"
  | "RISK"
  | "COLLECTION"
  | "SALES_PERFORMANCE"
  | "WEEKLY_EXECUTIVE"
  | "MONTHLY_EXECUTIVE"
  | "CUSTOM_DATE_RANGE";

export type ReportConfidence = "LOW" | "MEDIUM" | "HIGH";

export type ReportSectionStatus = "GENERATED" | "INSUFFICIENT_DATA" | "FALLBACK";

export type ReportSignificance = "HIGH" | "MEDIUM" | "LOW";

export type ReportFinding = {
  label: string;
  value: string;
  significance: ReportSignificance;
};

export type ReportSection = {
  sectionId: string;
  title: string;
  summary: string;
  findings: ReportFinding[];
  confidence: ReportConfidence;
  status: ReportSectionStatus;
  dataNote: string | null;
};

export type ExecutiveReport = {
  reportType: ReportType;
  organizationId: string;
  generatedAt: string;
  title: string;
  executiveSummary: string;
  sections: ReportSection[];
  overallConfidence: ReportConfidence;
  dataQualityNote: string | null;
  isFallback: boolean;
};

export type BuildExecutiveReportInput = {
  organizationId: string;
  reportType: ReportType;
  executiveScorecard?: ExecutiveScorecard | null;
  executiveForecast?: ExecutiveForecast | null;
  executiveAlerts?: ExecutiveAlertBundle | null;
  executiveCouncilSynthesis?: ExecutiveCouncilSynthesis | null;
  directorOpinionBundle?: DirectorOpinionBundle | null;
  executiveNarrative?: ExecutiveNarrative | null;
  paymentContext?: PaymentContext | null;
  paymentIntelligence?: PaymentIntelligence | null;
  quoteContext?: QuoteContext | null;
  quoteIntelligence?: QuoteIntelligence | null;
  collectionActionContext?: CollectionActionContext | null;
  signalTrendContext?: SignalTrendContext | null;
  dateRange?: { from: string; to: string } | null;
  failedSteps?: string[];
  companyPerformanceSignal?: CompanyPerformanceSignal | null;
  financialHealthIntelligence?: FinancialHealthIntelligence | null;
  outcomeAggregate?: ExecutiveDecisionOutcomeAggregate | null;
  executiveManagementReview?: ExecutiveManagementReviewResult | null;
};
