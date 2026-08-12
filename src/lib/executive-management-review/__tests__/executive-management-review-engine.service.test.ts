import { describe, it, expect } from "vitest";
import { buildExecutiveManagementReviewResult } from "../executive-management-review-engine.service";
import type { ExecutiveManagementReviewEngineInput } from "../executive-management-review.types";
import type { ExecutiveOperatingContext } from "@/lib/executive-operating-context";
import type { CompanyPerformanceSignal } from "@/lib/company-performance-signal";

function baseContext(overrides: Partial<ExecutiveOperatingContext> = {}): ExecutiveOperatingContext {
  return {
    organizationId: "org-1",
    mode: "CHAT",
    generatedAt: new Date().toISOString(),
    today: "2026-07-12",

    memoryContext: null,
    personContext: [],

    quoteContext: null,
    quoteConversionContext: null,
    quoteIntelligence: null,

    paymentContext: null,
    paymentIntelligence: null,

    collectionActionContext: null,
    latestBriefing: null,

    executiveForecast: null,
    executiveAlerts: null,
    executiveDecisionContext: null,
    executiveDecisionFollowUp: null,
    executiveAccountability: null,
    executiveRhythm: null,
    executiveAwareness: null,
    executiveScorecard: null,
    executiveNarrative: null,
    executiveFocus: null,
    goalIntelligence: null,
    customerPortfolioIntelligence: null,
    customerHealthIntelligence: null,

    expenseContext: null,
    expenseIntelligence: null,
    financialHealthIntelligence: null,
    companyPerformanceSignal: null,
    executivePriority: null,
    executiveOperatingRhythm: null,
    executiveFollowUpIntelligence: null,
    recentCompletedExecutiveActions: null,

    signal: {
      dailyAnchorSnapshot: null,
      sourceSignalSnapshot: null,
      recentSnapshots: [],
      trendContext: null,
    },
    diagnostics: { failedSteps: [], writeActions: [] },

    runDeferredOperatingContextWrites: async () => {},
    ...overrides,
  } as ExecutiveOperatingContext;
}

function mockCps(overrides: Partial<CompanyPerformanceSignal> = {}): CompanyPerformanceSignal {
  return {
    generatedAt: new Date().toISOString(),
    overallScore: 0.2,
    performanceLevel: "CRITICAL",
    momentum: "DECELERATING",
    primaryRisk: "Nakit tahsilatı ciddi şekilde geride",
    primaryStrength: null,
    executiveSummary: "Şirket bu dönemde kritik baskı altında.",
    confidence: "HIGH",
    componentScores: {
      operational: 0.2,
      financial: 0.1,
      forwardRisk: 0.3,
      goalProgress: 0.2,
      customerHealth: 0.4,
    },
    dataGaps: [],
    ...overrides,
  };
}

function buildInput(
  overrides: Partial<ExecutiveManagementReviewEngineInput> = {},
): ExecutiveManagementReviewEngineInput {
  return {
    operatingContext: baseContext(),
    executiveDecisionResult: null,
    executivePerformanceSignalResult: null,
    executiveResponsibilityMatrixResult: null,
    companyPerformanceSignal: null,
    outcomeAggregate: null,
    ...overrides,
  };
}

describe("executive management review — companyPerformanceSignal wiring", () => {
  it("companyPerformanceSignal null iken COMPANY_PERFORMANCE_CRITICAL/TOP_POSITIVE_SIGNAL kartlari uretilmez (regresyon)", () => {
    const result = buildExecutiveManagementReviewResult(buildInput({ companyPerformanceSignal: null }));

    expect(result.reviewType).not.toBe("COMPANY_PERFORMANCE_CRITICAL");
    expect(result.reviewType).not.toBe("TOP_POSITIVE_SIGNAL");
    expect(result.reviewType).toBe("DATA_INSUFFICIENT");
  });

  it("gercekci CRITICAL sinyal COMPANY_PERFORMANCE_CRITICAL kartini uretir", () => {
    const cps = mockCps({ performanceLevel: "CRITICAL", confidence: "HIGH" });
    const result = buildExecutiveManagementReviewResult(buildInput({ companyPerformanceSignal: cps }));

    expect(result.reviewType).toBe("COMPANY_PERFORMANCE_CRITICAL");
    expect(result.mainManagementConcern).toBe(cps.primaryRisk);
    expect(result.shouldSurfaceToUser).toBe(true);
  });

  it("gercekci STRONG sinyal TOP_POSITIVE_SIGNAL kartini uretir", () => {
    const cps = mockCps({
      performanceLevel: "STRONG",
      momentum: "ACCELERATING",
      primaryRisk: null,
      primaryStrength: "Tahsilat performansı çok güçlü",
      confidence: "HIGH",
    });
    const result = buildExecutiveManagementReviewResult(buildInput({ companyPerformanceSignal: cps }));

    expect(result.reviewType).toBe("TOP_POSITIVE_SIGNAL");
    expect(result.nonNegotiableFocus).toBe(cps.primaryStrength);
    expect(result.shouldSurfaceToUser).toBe(true);
  });
});
