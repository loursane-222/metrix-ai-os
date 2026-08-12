import { describe, it, expect } from "vitest";
import { buildExecutiveReport } from "../executive-reporting-engine.service";
import type { BuildExecutiveReportInput } from "../executive-reporting.types";
import type { CompanyPerformanceSignal } from "@/lib/company-performance-signal";
import type { ExecutiveScorecard } from "@/lib/executive-scorecard";

function mockCps(): CompanyPerformanceSignal {
  return {
    generatedAt: new Date().toISOString(),
    overallScore: 0.3,
    performanceLevel: "PRESSURED",
    momentum: "STABLE",
    primaryRisk: "Tahsilat gecikmesi büyüyor",
    primaryStrength: null,
    executiveSummary: "Şirket performansı baskı altında.",
    confidence: "HIGH",
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

function buildInput(
  overrides: Partial<BuildExecutiveReportInput> = {},
): BuildExecutiveReportInput {
  return {
    organizationId: "org-1",
    reportType: "MONTHLY_EXECUTIVE",
    ...overrides,
  };
}

describe("executive reporting — companyPerformanceSignal wiring (monthly_executive_summary)", () => {
  it("companyPerformanceSignal ve executiveScorecard null iken bolum INSUFFICIENT_DATA kalir", () => {
    const report = buildExecutiveReport(buildInput({ companyPerformanceSignal: null, executiveScorecard: null }));
    const section = report.sections.find((s) => s.sectionId === "monthly_executive_summary");

    expect(section?.status).toBe("INSUFFICIENT_DATA");
    expect(report.isFallback).toBe(true);
  });

  it("companyPerformanceSignal ve executiveScorecard gercek veriyle geldiginde bolum GENERATED'a gecer", () => {
    const cps = mockCps();
    const scorecard = mockScorecard();
    const report = buildExecutiveReport(buildInput({ companyPerformanceSignal: cps, executiveScorecard: scorecard }));
    const section = report.sections.find((s) => s.sectionId === "monthly_executive_summary");

    expect(section?.status).toBe("GENERATED");
    expect(section?.summary).toBe(cps.executiveSummary);
    expect(report.isFallback).toBe(false);
  });
});
