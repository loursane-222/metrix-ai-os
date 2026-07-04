import type {
  CustomerPortfolioIntelligence,
  CustomerPortfolioPromptSummary,
} from "./customer-portfolio-intelligence.types";

export function buildCustomerPortfolioPromptSummary(
  result: CustomerPortfolioIntelligence,
): CustomerPortfolioPromptSummary {
  return {
    portfolioSummary: result.portfolioSummary,
    concentrationRiskLevel: result.concentrationRisk.level,
    atRiskCount: result.atRiskCustomers.length,
    strategicCount: result.strategicCustomers.length,
    churnRiskCount: result.churnRiskCustomers.length,
    executiveSignals: result.executiveSignals,
    confidence: result.confidence,
    dataGaps: result.dataGaps,
  };
}
