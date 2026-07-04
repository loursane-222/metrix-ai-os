import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { BriefingPackage } from "@/lib/daily-briefing/daily-briefing.types";
import type { QuoteIntelligence } from "@/lib/core/quotes/quote-intelligence-builder";
import type { PaymentIntelligence } from "@/lib/core/payments/payment-intelligence-builder";
import type { CollectionActionContext } from "@/lib/core/collection-actions/collection-action-context-builder";

export type AlertSeverity = "CRITICAL" | "HIGH" | "WATCH";

export type AlertCategory =
  | "COLLECTION_PRESSURE"
  | "CASH_FLOW_RISK"
  | "QUOTE_PIPELINE_RISK"
  | "EXECUTION_GAP"
  | "CURRENCY_EXPOSURE"
  | "MARKET_RISK"
  | "STRATEGIC_HEALTH";

export type AlertSourceSystem =
  | "forecasting"
  | "briefing"
  | "quote_intelligence"
  | "collection_action"
  | "payment_intelligence";

export type ExecutiveAlert = {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  source: AlertSourceSystem;
  headline: string;
  actionableStep: string | null;
  isActionable: boolean;
};

export type ExecutiveAlertBundle = {
  organizationId: string;
  generatedAt: string;
  criticalAlerts: ExecutiveAlert[];
  highAlerts: ExecutiveAlert[];
  watchAlerts: ExecutiveAlert[];
  totalCount: number;
  hasActionableItems: boolean;
};

export type BuildExecutiveAlertsInput = {
  organizationId: string;
  executiveForecast?: ExecutiveForecast | null;
  latestBriefing?: BriefingPackage | null;
  quoteIntelligence?: QuoteIntelligence | null;
  paymentIntelligence?: PaymentIntelligence | null;
  collectionActionContext?: CollectionActionContext | null;
};
