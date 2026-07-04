import type {
  CompanyPerformanceSignal,
  CompanyPerformanceSignalPromptSummary,
} from "./company-performance-signal.types";

export function buildCompanyPerformanceSignalPromptSummary(
  signal: CompanyPerformanceSignal,
): CompanyPerformanceSignalPromptSummary {
  return {
    performanceLevel: signal.performanceLevel,
    momentum: signal.momentum,
    primaryRisk: signal.primaryRisk,
    primaryStrength: signal.primaryStrength,
    executiveSummary: signal.executiveSummary,
    confidence: signal.confidence,
  };
}
