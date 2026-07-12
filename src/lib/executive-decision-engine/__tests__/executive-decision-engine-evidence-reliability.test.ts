import { describe, it, expect } from "vitest";
import { buildExecutiveDecisionResult } from "../executive-decision-engine.service";
import { buildExecutiveDecisionPromptSummary } from "../executive-decision-summary.service";
import type { BuildExecutiveDecisionResultInput } from "../executive-decision-engine.types";
import type { ExecutiveOperatingContext } from "@/lib/executive-operating-context";
import type { ExecutiveAlertBundle, ExecutiveAlert } from "@/lib/executive-alerts/executive-alert.types";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";

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

function cashAlert(): ExecutiveAlert {
  return {
    id: "cash-alert-1",
    severity: "CRITICAL",
    category: "CASH_FLOW_RISK",
    source: "forecasting",
    headline: "Nakit riski kritik seviyede",
    actionableStep: "Bugun nakit girisini netlestir",
    isActionable: true,
  };
}

function salesAlert(): ExecutiveAlert {
  return {
    id: "sales-alert-1",
    severity: "CRITICAL",
    category: "QUOTE_PIPELINE_RISK",
    source: "quote_intelligence",
    headline: "Satis hattinda kritik risk",
    actionableStep: "Bugun sicak teklifleri netlestir",
    isActionable: true,
  };
}

function alertBundle(alerts: ExecutiveAlert[]): ExecutiveAlertBundle {
  return {
    organizationId: "org-1",
    generatedAt: new Date().toISOString(),
    criticalAlerts: alerts,
    highAlerts: [],
    watchAlerts: [],
    totalCount: alerts.length,
    hasActionableItems: alerts.length > 0,
  };
}

function cashForecastCritical(confidence: "LOW" | "MEDIUM" | "HIGH"): ExecutiveForecast {
  return {
    organizationId: "org-1",
    generatedAt: new Date().toISOString(),
    horizon: "30D",
    overallRiskLevel: "CRITICAL",
    overallConfidence: confidence,
    signals: [
      {
        riskType: "CASH_FLOW",
        riskLevel: "CRITICAL",
        confidence,
        confidenceScore: confidence === "LOW" ? 35 : confidence === "MEDIUM" ? 65 : 90,
        headline: "Nakit akisi kritik",
        explanation: "Nakit akisinda kritik risk tespit edildi.",
        actionableStep: "Bugun nakit girisini netlestir",
        evidence: [{ dataPoint: "cashBalance", value: "-1000", source: "payment" }],
        dataLimitations: [],
      },
    ],
    projection: {
      horizon: "30D",
      expectedCollection7d: 0,
      expectedCollection30d: 0,
      expectedRevenue30d: 0,
      bestCaseRevenue: 0,
      worstCaseRevenue: 0,
      projectedCashInflow: 0,
      confidence,
      dataLimitations: [],
    },
    executiveSummary: "Nakit akisinda kritik risk.",
    dataQualityNote: "",
  };
}

function buildInput(context: ExecutiveOperatingContext): BuildExecutiveDecisionResultInput {
  return { operatingContext: context };
}

describe("evidence reliability downgrade", () => {
  it("ilgili failed step yokken HIGH confidence degismeden kalir", () => {
    const context = baseContext({ executiveAlerts: alertBundle([cashAlert()]) });
    const result = buildExecutiveDecisionResult(buildInput(context));

    expect(result.primaryDecision.category).toBe("CASH");
    expect(result.primaryDecision.confidence).toBe("HIGH");
    expect(result.primaryDecision.evidenceReliability).toBeNull();
  });

  // Not: diagnostics.failedSteps bos degilken buildDataQualityCandidates (Faz 2 davranisi,
  // bu gorev kapsami disinda) her zaman CRITICAL/sourceRank=2 bir DATA_QUALITY candidate'i
  // uretir ve bu candidate primary sirayi kazanir. Bu yuzden asagidaki testler ilgili
  // decision'i primary + supporting kumesi icinde arar; mevcut siralama davranisina dokunulmaz.
  function findDecision(
    result: ReturnType<typeof buildExecutiveDecisionResult>,
    category: string,
  ) {
    return [result.primaryDecision, ...result.supportingDecisions].find(
      (decision) => decision.category === category,
    );
  }

  it("CASH karari ilgili payment verisi arizasinda HIGH -> MEDIUM duser", () => {
    const context = baseContext({
      executiveAlerts: alertBundle([cashAlert()]),
      diagnostics: { failedSteps: ["paymentContext"], writeActions: [] },
    });
    const result = buildExecutiveDecisionResult(buildInput(context));
    const cashDecision = findDecision(result, "CASH");

    expect(cashDecision?.confidence).toBe("MEDIUM");
    expect(cashDecision?.evidenceReliability).toEqual({
      status: "DEGRADED",
      failedSteps: ["paymentContext"],
    });
  });

  it("SALES karari ilgili quote verisi arizasinda duser", () => {
    const context = baseContext({
      executiveAlerts: alertBundle([salesAlert()]),
      diagnostics: { failedSteps: ["quoteContext"], writeActions: [] },
    });
    const result = buildExecutiveDecisionResult(buildInput(context));
    const salesDecision = findDecision(result, "SALES");

    expect(salesDecision?.confidence).toBe("MEDIUM");
    expect(salesDecision?.evidenceReliability?.status).toBe("DEGRADED");
  });

  it("ilgisiz failed step decision confidence'ini degistirmez", () => {
    const context = baseContext({
      executiveAlerts: alertBundle([cashAlert()]),
      diagnostics: { failedSteps: ["executiveNarrative"], writeActions: [] },
    });
    const result = buildExecutiveDecisionResult(buildInput(context));
    const cashDecision = findDecision(result, "CASH");

    expect(cashDecision?.confidence).toBe("HIGH");
    expect(cashDecision?.evidenceReliability).toBeNull();
  });

  it("birden fazla eslesen failed step yalnizca tek kademe dusus uretir", () => {
    const context = baseContext({
      executiveAlerts: alertBundle([cashAlert()]),
      diagnostics: { failedSteps: ["paymentContext", "executiveForecast"], writeActions: [] },
    });
    const result = buildExecutiveDecisionResult(buildInput(context));
    const cashDecision = findDecision(result, "CASH");

    expect(cashDecision?.confidence).toBe("MEDIUM");
    expect(cashDecision?.evidenceReliability?.failedSteps).toEqual([
      "paymentContext",
      "executiveForecast",
    ]);
  });

  it("LOW confidence daha asagi dusmez", () => {
    const context = baseContext({
      executiveForecast: cashForecastCritical("LOW"),
      diagnostics: { failedSteps: ["paymentContext"], writeActions: [] },
    });
    const result = buildExecutiveDecisionResult(buildInput(context));
    const cashDecision = findDecision(result, "CASH");

    expect(cashDecision?.confidence).toBe("LOW");
  });

  it("reliability metadata summary katmanina tasinir", () => {
    const context = baseContext({
      executiveAlerts: alertBundle([cashAlert()]),
      diagnostics: { failedSteps: ["paymentContext"], writeActions: [] },
    });
    const result = buildExecutiveDecisionResult(buildInput(context));
    const cashDecision = findDecision(result, "CASH")!;
    const summary = buildExecutiveDecisionPromptSummary(cashDecision);

    expect(summary.evidenceReliability).toEqual({
      status: "DEGRADED",
      failedSteps: ["paymentContext"],
    });
  });

  it("primary ve supporting decision'lar bagimsiz degerlendirilir", () => {
    const context = baseContext({
      executiveAlerts: alertBundle([cashAlert(), salesAlert()]),
      diagnostics: { failedSteps: ["paymentContext"], writeActions: [] },
    });
    const result = buildExecutiveDecisionResult(buildInput(context));

    const cashDecision = [result.primaryDecision, ...result.supportingDecisions].find(
      (decision) => decision.category === "CASH",
    );
    const salesDecision = [result.primaryDecision, ...result.supportingDecisions].find(
      (decision) => decision.category === "SALES",
    );

    expect(cashDecision?.confidence).toBe("MEDIUM");
    expect(cashDecision?.evidenceReliability).not.toBeNull();
    expect(salesDecision?.confidence).toBe("HIGH");
    expect(salesDecision?.evidenceReliability).toBeNull();
  });

  it("failed step'in kategoriyle iliskisi degisse de candidate secimi ve evidenceRefs/sourceSignals kumesi degismez", () => {
    // Ayni sayida/nitelikte failedStep, farkli kategoriyle iliskili olsa bile
    // (biri CASH'i etkiler, digeri etkilemez) candidate uretimi ve siralamasi
    // (id kumesi, evidenceRefs, sourceSignals) ayni kalmali; yalnizca ilgili
    // decision'in confidence'i degismeli.
    const related = buildExecutiveDecisionResult(
      buildInput(
        baseContext({
          executiveAlerts: alertBundle([cashAlert(), salesAlert()]),
          diagnostics: { failedSteps: ["paymentContext"], writeActions: [] },
        }),
      ),
    );
    const unrelated = buildExecutiveDecisionResult(
      buildInput(
        baseContext({
          executiveAlerts: alertBundle([cashAlert(), salesAlert()]),
          diagnostics: { failedSteps: ["executiveNarrative"], writeActions: [] },
        }),
      ),
    );

    // primaryDecision DATA_QUALITY candidate'i oldugu icin evidenceRefs'i
    // (failedStep adini tasidigindan) kasitli olarak farklidir; asil kanit,
    // candidate kumesinin (id seti) ve supporting sayisinin degismemesidir.
    expect(related.primaryDecision.category).toBe("DATA_QUALITY");
    expect(unrelated.primaryDecision.category).toBe("DATA_QUALITY");
    expect(related.supportingDecisions.map((decision) => decision.id)).toEqual(
      unrelated.supportingDecisions.map((decision) => decision.id),
    );

    const relatedCash = findDecision(related, "CASH");
    const unrelatedCash = findDecision(unrelated, "CASH");
    expect(relatedCash?.evidenceRefs).toEqual(unrelatedCash?.evidenceRefs);
    expect(relatedCash?.sourceSignals).toEqual(unrelatedCash?.sourceSignals);
    expect(relatedCash?.confidence).toBe("MEDIUM");
    expect(unrelatedCash?.confidence).toBe("HIGH");
  });
});
