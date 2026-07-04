export type CustomerHealthLabel = "HEALTHY" | "WATCH" | "AT_RISK" | "CRITICAL";
export type CustomerHealthConfidence = "LOW" | "MEDIUM" | "HIGH";
export type CustomerHealthRecommendedAction =
  | "COLLECTION_MEETING"
  | "SEND_QUOTE"
  | "REENGAGEMENT_CALL"
  | "CLOSE_WATCH"
  | "WATCH_AND_WAIT";

export type CustomerHealthPaymentHealth = {
  overdueCount: number;
  totalOverdue: number;
  overdueRatio: number;
};

export type CustomerHealthSalesMomentum = {
  activeQuoteValue: number;
  abandonRiskCount: number;
  hasActiveQuoteRisk: boolean;
};

export type CustomerHealthActivitySignal = {
  daysSinceLastActivity: number;
  isEngaged: boolean;
  followUpCount: number;
};

export type CustomerHealthProfile = {
  personId: string | null;
  customerName: string;
  healthScore: number;
  healthLabel: CustomerHealthLabel;
  paymentHealth: CustomerHealthPaymentHealth;
  salesMomentum: CustomerHealthSalesMomentum;
  activitySignal: CustomerHealthActivitySignal;
  churnRisk: boolean;
  upsellOpportunity: boolean;
  repurchaseCandidate: boolean;
  opportunityScore: number;
  recommendedAction: CustomerHealthRecommendedAction;
  recommendedActionReason: string;
  executiveInsights: string[];
  confidence: CustomerHealthConfidence;
  // Customer kaydından gelen enrichment (null = Customer kaydı eşleşmedi)
  customerStatus: string | null;
  customerTier: string | null;
  storedHealthScore: number | null;
  balanceCents: number | null;
};

export type CustomerHealthDistribution = {
  healthyCount: number;
  watchCount: number;
  atRiskCount: number;
  criticalCount: number;
};

export type CustomerHealthIntelligence = {
  profiles: CustomerHealthProfile[];
  distribution: CustomerHealthDistribution;
  criticalCustomers: CustomerHealthProfile[];
  atRiskCustomers: CustomerHealthProfile[];
  watchCustomers: CustomerHealthProfile[];
  topInsights: string[];
  confidence: CustomerHealthConfidence;
  generatedAt: string;
  version: "v1.2";
};

export type CustomerHealthPromptSummary = {
  distribution: CustomerHealthDistribution;
  criticalCount: number;
  atRiskCount: number;
  watchCount: number;
  topCriticalName: string | null;
  topAtRiskName: string | null;
  topInsights: string[];
  topUpsellOpportunities: string[];
  topRepurchaseCandidates: string[];
  topRecommendedActions: string[];
  confidence: CustomerHealthConfidence;
};
