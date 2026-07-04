export type CustomerSegment =
  | "HIGH_VALUE"
  | "GROWING"
  | "AT_RISK"
  | "DORMANT"
  | "NEW"
  | "UNKNOWN";

export type ConcentrationRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type PortfolioConfidence = "LOW" | "MEDIUM" | "HIGH";

export type CustomerProfile = {
  key: string;
  personId: string | null;
  displayName: string;
  segment: CustomerSegment;
  totalQuoteValue: number;
  wonQuoteValue: number;
  activeQuoteValue: number;
  quoteCount: number;
  wonQuoteCount: number;
  lostQuoteCount: number;
  totalPaymentDue: number;
  totalPaid: number;
  totalOverdue: number;
  overdueCount: number;
  lastActivityDate: string | null;
  daysSinceLastActivity: number;
  // Customer kaydından gelen enrichment alanları (Customer kaydı yoksa null)
  customerStatus: string | null;
  customerTier: string | null;
  storedHealthScore: number | null;
  balanceCents: number | null; // null=Customer kaydı yok, 0=bakiye yok
};

export type ConcentrationRisk = {
  level: ConcentrationRiskLevel;
  topCustomerName: string | null;
  topCustomerShare: number;
  topCustomerValue: number;
  totalPortfolioValue: number;
  topCustomerStatus: string | null;
  topCustomerBalanceCents: number | null;
};

export type DependencyRisk = {
  level: ConcentrationRiskLevel;
  dependentCustomerCount: number;
  top3ShareCombined: number;
};

export type CustomerRiskItem = {
  displayName: string;
  personId: string | null;
  totalOverdue: number;
  overdueCount: number;
  daysSinceLastActivity: number;
  balanceCents: number | null;
  customerStatus: string | null;
};

export type StrategicCustomer = {
  displayName: string;
  personId: string | null;
  totalValue: number;
  wonQuoteValue: number;
  paymentHealthy: boolean;
  customerTier: string | null;
  storedHealthScore: number | null;
};

export type CustomerPortfolioIntelligence = {
  customerSegments: CustomerProfile[];
  concentrationRisk: ConcentrationRisk;
  dependencyRisk: DependencyRisk;
  churnRiskCustomers: CustomerRiskItem[];
  strategicCustomers: StrategicCustomer[];
  atRiskCustomers: CustomerRiskItem[];
  portfolioSummary: string;
  executiveSignals: string[];
  confidence: PortfolioConfidence;
  dataGaps: string[];
  quotePersonCoverage: number;
  paymentPersonCoverage: number;
  totalCustomerCount: number;
};

export type CustomerPortfolioPromptSummary = {
  portfolioSummary: string;
  concentrationRiskLevel: ConcentrationRiskLevel;
  atRiskCount: number;
  strategicCount: number;
  churnRiskCount: number;
  executiveSignals: string[];
  confidence: PortfolioConfidence;
  dataGaps: string[];
};
