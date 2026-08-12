import { describe, it, expect } from "vitest";
import { buildExecutiveOperatingRhythm } from "../executive-operating-rhythm-engine.service";
import type { BuildExecutiveOperatingRhythmInput } from "../executive-operating-rhythm.types";
import type { CompanyPerformanceSignal, CompanyPerformanceLevel, CompanyPerformanceMomentum } from "@/lib/company-performance-signal";

function mockCps(
  performanceLevel: CompanyPerformanceLevel,
  momentum: CompanyPerformanceMomentum,
  confidence: CompanyPerformanceSignal["confidence"] = "HIGH",
): CompanyPerformanceSignal {
  return {
    generatedAt: new Date().toISOString(),
    overallScore: 0.3,
    performanceLevel,
    momentum,
    primaryRisk: "Nakit tahsilatı geride",
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

function buildInput(companyPerformanceSignal: CompanyPerformanceSignal | null): BuildExecutiveOperatingRhythmInput {
  return {
    organizationId: "org-1",
    executivePriority: null,
    executiveForecast: null,
    executiveAlerts: null,
    executiveDecisionContext: null,
    executiveScorecard: null,
    customerPortfolioIntelligence: null,
    goalIntelligence: null,
    companyPerformanceSignal,
    latestBriefing: null,
    quoteIntelligence: null,
  };
}

describe("executive operating rhythm — companyPerformanceSignal wiring", () => {
  it("CRITICAL performanceLevel bugun icin company_performance adayini tetikler ve postur CRITICAL olur", () => {
    const cps = mockCps("CRITICAL", "STABLE");
    const result = buildExecutiveOperatingRhythm(buildInput(cps));

    expect(result.today.items).toHaveLength(1);
    expect(result.today.items[0].source).toBe("company_performance");
    expect(result.today.items[0].title).toBe("Şirket performansı kritik seviyede");
    expect(result.overallPosture).toBe("CRITICAL");
  });

  it("companyPerformanceSignal null iken hicbir aday tetiklenmez, postur STABLE kalir", () => {
    const result = buildExecutiveOperatingRhythm(buildInput(null));

    expect(result.today.items).toHaveLength(0);
    expect(result.thisMonth.items).toHaveLength(0);
    expect(result.overallPosture).toBe("STABLE");
  });

  it("CRITICAL olmayan performanceLevel bugun adayini tetiklemez", () => {
    const cps = mockCps("STABLE", "STABLE");
    const result = buildExecutiveOperatingRhythm(buildInput(cps));

    expect(result.today.items).toHaveLength(0);
    expect(result.overallPosture).toBe("STABLE");
  });

  it("PRESSURED performanceLevel + DECELERATING momentum postur PRESSURED yapar ve bu-ay adayini tetikler", () => {
    const cps = mockCps("PRESSURED", "DECELERATING");
    const result = buildExecutiveOperatingRhythm(buildInput(cps));

    expect(result.today.items).toHaveLength(0);
    expect(result.overallPosture).toBe("PRESSURED");
    expect(result.thisMonth.items).toHaveLength(1);
    expect(result.thisMonth.items[0].source).toBe("company_performance");
    expect(result.thisMonth.items[0].title).toBe("Şirket performans ivmesi yavaşlıyor");
  });
});
