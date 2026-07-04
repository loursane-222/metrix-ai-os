import type { ExecutiveAlertBundle } from "@/lib/executive-alerts/executive-alert.types";
import type { ExecutiveDecisionContext } from "@/lib/executive-decision-loop";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { ExecutiveRhythm } from "@/lib/executive-rhythm/executive-rhythm.types";
import type { CollectionActionContext } from "@/lib/core/collection-actions/collection-action-context-builder";
import type { PaymentIntelligence } from "@/lib/core/payments/payment-intelligence-builder";
import type { QuoteIntelligence } from "@/lib/core/quotes/quote-intelligence-builder";
import type { SignalTrendContext } from "@/lib/signal-persistence/signal-trend-context.types";

export type ExecutiveAwarenessDirection =
  | "IMPROVING"
  | "STABLE"
  | "DETERIORATING"
  | "CRITICAL"
  | "UNKNOWN";

export type ExecutiveBusinessPosture =
  | "HEALTHY"
  | "WATCH"
  | "PRESSURED"
  | "AT_RISK";

export type ExecutiveAwarenessConfidence = "LOW" | "MEDIUM" | "HIGH";

export type ExecutiveAwarenessWatchArea =
  | "CASH"
  | "SALES"
  | "COLLECTION"
  | "MARKET"
  | "EXECUTION"
  | "DECISION_FOLLOW_UP"
  | "DATA_QUALITY";

export type ExecutiveAwareness = {
  overallDirection: ExecutiveAwarenessDirection;
  businessPosture: ExecutiveBusinessPosture;
  confidence: ExecutiveAwarenessConfidence;
  primaryNarrative: string;
  positiveDrivers: string[];
  negativeDrivers: string[];
  watchAreas: ExecutiveAwarenessWatchArea[];
  managementImplication: string;
  recommendedAttention: string[];
  dataQualityNote: string | null;
  evidence: string[];
};

export type BuildExecutiveAwarenessInput = {
  organizationId: string;
  executiveForecast?: ExecutiveForecast | null;
  executiveAlerts?: ExecutiveAlertBundle | null;
  signalTrendContext?: SignalTrendContext | null;
  executiveDecisionContext?: ExecutiveDecisionContext | null;
  executiveRhythm?: ExecutiveRhythm | null;
  paymentIntelligence?: PaymentIntelligence | null;
  quoteIntelligence?: QuoteIntelligence | null;
  collectionActionContext?: CollectionActionContext | null;
  failedSteps?: string[];
};
