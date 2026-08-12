import { describe, it, expect } from "vitest";
import { buildExecutivePrioritizationResult } from "../executive-prioritization-engine.service";
import type { ExecutivePrioritizationInput } from "../executive-prioritization.types";
import type { CompanyPerformanceSignal, CompanyPerformanceLevel } from "@/lib/company-performance-signal";
import type { ExecutiveScorecard } from "@/lib/executive-scorecard";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";

function mockScorecard(): ExecutiveScorecard {
  return {
    generatedAt: new Date().toISOString(),
    overallLevel: "PRESSURED",
    confidence: "HIGH",
    areas: [],
    strongestArea: null,
    weakestArea: "CASH_HEALTH",
    summary: "Nakit sağlığı baskı altında.",
    dataQualityNote: null,
  };
}

function mockForecast(): ExecutiveForecast {
  return {
    organizationId: "org-1",
    generatedAt: new Date().toISOString(),
    horizon: "30D",
    overallRiskLevel: "WATCH",
    overallConfidence: "HIGH",
    signals: [],
    projection: {
      horizon: "30D",
      expectedCollection7d: 0,
      expectedCollection30d: 0,
      expectedRevenue30d: 0,
      bestCaseRevenue: 0,
      worstCaseRevenue: 0,
      projectedCashInflow: 0,
      confidence: "HIGH",
      dataLimitations: [],
    },
    executiveSummary: "Tahmin riski izlenebilir seviyede.",
    dataQualityNote: "",
  };
}

function mockCps(performanceLevel: CompanyPerformanceLevel, confidence: CompanyPerformanceSignal["confidence"]): CompanyPerformanceSignal {
  return {
    generatedAt: new Date().toISOString(),
    overallScore: 0.3,
    performanceLevel,
    momentum: "STABLE",
    primaryRisk: "Tahsilat gecikmesi büyüyor",
    primaryStrength: null,
    executiveSummary: "Şirket performansı değerlendiriliyor.",
    confidence,
    componentScores: {
      operational: 0.3,
      financial: 0.3,
      forwardRisk: 0.3,
      goalProgress: 0.3,
      customerHealth: 0.3,
    },
    dataGaps: [],
  };
}

function buildInput(companyPerformanceSignal: CompanyPerformanceSignal | null): ExecutivePrioritizationInput {
  return {
    organizationId: "org-1",
    executiveForecast: mockForecast(),
    executiveScorecard: mockScorecard(),
    outcomeAggregate: null,
    companyPerformanceSignal,
    customerPortfolioIntelligence: null,
    latestBriefing: null,
  };
}

describe("executive prioritization — companyPerformanceSignal risk severity wiring", () => {
  it("companyPerformanceSignal null iken sabit 0.3 fallback skoru kullanilir", () => {
    const result = buildExecutivePrioritizationResult(buildInput(null));

    expect(result.topExecutivePriority).not.toBeNull();
    expect(result.topExecutivePriority!.score).toBe(0.44);
  });

  it("LOW confidence sinyal de ayni 0.3 fallback skorunu uretir (null ile ayni davranis)", () => {
    const cps = mockCps("CRITICAL", "LOW");
    const result = buildExecutivePrioritizationResult(buildInput(cps));

    expect(result.topExecutivePriority).not.toBeNull();
    expect(result.topExecutivePriority!.score).toBe(0.44);
  });

  it("gercek yuksek-confidence CRITICAL sinyal skoru 0.3 fallback'tan farkli ve daha yuksek hesaplar", () => {
    const cps = mockCps("CRITICAL", "HIGH");
    const result = buildExecutivePrioritizationResult(buildInput(cps));

    expect(result.topExecutivePriority).not.toBeNull();
    expect(result.topExecutivePriority!.score).toBe(0.58);
    expect(result.topExecutivePriority!.score).not.toBe(0.44);
    expect(result.topExecutivePriority!.evidence).toContain(`şirket performansı: ${cps.performanceLevel}`);
  });

  it("PRESSURED sinyal CRITICAL'dan dusuk ama null'dan yuksek skor uretir (performanceLevel'a tutarli)", () => {
    const pressured = buildExecutivePrioritizationResult(buildInput(mockCps("PRESSURED", "HIGH")));
    const critical = buildExecutivePrioritizationResult(buildInput(mockCps("CRITICAL", "HIGH")));
    const none = buildExecutivePrioritizationResult(buildInput(null));

    expect(pressured.topExecutivePriority!.score).toBeGreaterThan(none.topExecutivePriority!.score);
    expect(critical.topExecutivePriority!.score).toBeGreaterThan(pressured.topExecutivePriority!.score);
  });
});
