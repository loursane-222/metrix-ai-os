import { describe, it, expect } from "vitest";
import { buildExecutiveDelegationResult } from "../executive-delegation-engine.service";
import { buildExecutiveResponsibilityMatrix } from "@/lib/executive-responsibility-matrix";
import type { ExecutiveDelegationEngineInput } from "../executive-delegation.types";
import type {
  ExecutiveDecision,
  ExecutiveDecisionCategory,
  ExecutiveDecisionConfidence,
  ExecutiveDecisionResult,
} from "@/lib/executive-decision-engine";
import type { ExecutiveOperatingContext } from "@/lib/executive-operating-context";

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

function buildDecision(
  category: ExecutiveDecisionCategory,
  confidence: ExecutiveDecisionConfidence,
  overrides: Partial<ExecutiveDecision> = {},
): ExecutiveDecision {
  return {
    id: "decision-1",
    category,
    priority: "HIGH",
    title: "Test karari",
    rationale: "Test gerekce",
    firstAction: "Test ilk adim",
    supportingActions: [],
    risks: [],
    opportunities: [],
    impact: 80,
    urgency: 80,
    confidence,
    confidenceScore: 65,
    evidenceRefs: [],
    sourceSignals: ["Test sinyali"],
    evidenceReliability: null,
    followUpWindow: null,
    isFallback: false,
    ...overrides,
  };
}

function buildDecisionResult(decision: ExecutiveDecision): ExecutiveDecisionResult {
  return {
    organizationId: "org-1",
    generatedAt: new Date().toISOString(),
    mode: "CHAT",
    primaryDecision: decision,
    supportingDecisions: [],
    risks: [],
    opportunities: [],
    decisionSummary: decision.title,
    promptSummary: {
      priority: decision.priority,
      category: decision.category,
      decisionLine: decision.title,
      firstAction: decision.firstAction,
      riskLine: null,
      confidence: decision.confidence,
      evidenceRefs: decision.evidenceRefs,
      sourceSignals: decision.sourceSignals,
      evidenceReliability: decision.evidenceReliability,
    },
    overallConfidence: decision.confidence,
    dataQualityNote: null,
    diagnostics: { failedSteps: [], fallbackReason: null },
  };
}

function buildDelegationInput(
  category: ExecutiveDecisionCategory,
  confidence: ExecutiveDecisionConfidence,
  decisionOverrides: Partial<ExecutiveDecision> = {},
): ExecutiveDelegationEngineInput {
  const decision = buildDecision(category, confidence, decisionOverrides);
  return {
    operatingContext: baseContext(),
    executiveDecisionResult: buildDecisionResult(decision),
    currentUserName: "Ada",
    organizationMembershipRole: null,
  };
}

// STRATEGY kategorisi + notr metin: resolveStrategyDelegation'i tetikler,
// baz olarak sabit "HIGH" delegasyon guveni uretir (ownerType USER).
function strategyInput(confidence: ExecutiveDecisionConfidence): ExecutiveDelegationEngineInput {
  return buildDelegationInput("STRATEGY", confidence, {
    title: "Fiyat politikasini gozden gecir",
    rationale: "Piyasa baskisi fiyatlama kararini etkiliyor",
    firstAction: "Fiyat politikasini bugun netlestir",
  });
}

// DECISION_FOLLOW_UP kategorisi + notr metin: resolveSystemDelegation'i tetikler,
// baz olarak sabit "MEDIUM" delegasyon guveni uretir (ownerType SYSTEM).
function systemInput(confidence: ExecutiveDecisionConfidence): ExecutiveDelegationEngineInput {
  return buildDelegationInput("DECISION_FOLLOW_UP", confidence, {
    title: "Karar takibini surdur",
    rationale: "Takip ritmi devam ediyor",
    firstAction: "Durumu izle",
  });
}

// CUSTOMER kategorisi + hicbir resolver anahtar kelimesi icermeyen notr metin:
// tum kural fonksiyonlari null doner, resolveFallbackDelegation calisir ve
// isManagementDecision=false oldugundan sabit "LOW" delegasyon guveni uretir.
function fallbackInput(confidence: ExecutiveDecisionConfidence): ExecutiveDelegationEngineInput {
  return buildDelegationInput("CUSTOMER", confidence, {
    title: "Genel durum notu",
    rationale: "Rutin gozlem",
    firstAction: "Bilgiyi gozden gecir",
  });
}

describe("executive delegation confidence ceiling", () => {
  it("decision HIGH + delegation HIGH -> HIGH", () => {
    const result = buildExecutiveDelegationResult(strategyInput("HIGH"));
    expect(result.confidence).toBe("HIGH");
  });

  it("decision HIGH + delegation MEDIUM -> MEDIUM", () => {
    const result = buildExecutiveDelegationResult(systemInput("HIGH"));
    expect(result.confidence).toBe("MEDIUM");
  });

  it("decision MEDIUM + delegation HIGH -> MEDIUM", () => {
    const result = buildExecutiveDelegationResult(strategyInput("MEDIUM"));
    expect(result.confidence).toBe("MEDIUM");
  });

  it("decision LOW + delegation HIGH -> LOW", () => {
    const result = buildExecutiveDelegationResult(strategyInput("LOW"));
    expect(result.confidence).toBe("LOW");
  });

  it("decision LOW + delegation MEDIUM -> LOW", () => {
    const result = buildExecutiveDelegationResult(systemInput("LOW"));
    expect(result.confidence).toBe("LOW");
  });

  it("decision LOW + delegation LOW -> LOW", () => {
    const result = buildExecutiveDelegationResult(fallbackInput("LOW"));
    expect(result.confidence).toBe("LOW");
  });

  it("owner, rationale, action ve diger alanlar decision confidence'tan etkilenmez", () => {
    const high = buildExecutiveDelegationResult(strategyInput("HIGH"));
    const low = buildExecutiveDelegationResult(strategyInput("LOW"));

    expect(low.ownerType).toBe(high.ownerType);
    expect(low.ownerName).toBe(high.ownerName);
    expect(low.responsibilityReason).toBe(high.responsibilityReason);
    expect(low.requiredActionByOwner).toBe(high.requiredActionByOwner);
    expect(low.userShouldDoNow).toBe(high.userShouldDoNow);
    expect(low.riskIfNotAssigned).toBe(high.riskIfNotAssigned);
    expect(low.delegationAdvice).toBe(high.delegationAdvice);
    // Yalnizca confidence farklilasir.
    expect(high.confidence).toBe("HIGH");
    expect(low.confidence).toBe("LOW");
  });

  it("resolver secimi (STRATEGY vs DECISION_FOLLOW_UP vs fallback) decision confidence'tan etkilenmez", () => {
    const strategyHigh = buildExecutiveDelegationResult(strategyInput("HIGH"));
    const strategyLow = buildExecutiveDelegationResult(strategyInput("LOW"));
    expect(strategyHigh.ownerType).toBe("USER");
    expect(strategyLow.ownerType).toBe("USER");

    const systemHigh = buildExecutiveDelegationResult(systemInput("HIGH"));
    const systemLow = buildExecutiveDelegationResult(systemInput("LOW"));
    expect(systemHigh.ownerType).toBe("SYSTEM");
    expect(systemLow.ownerType).toBe("SYSTEM");

    const fallbackLow = buildExecutiveDelegationResult(fallbackInput("LOW"));
    expect(fallbackLow.ownerType).toBe("UNASSIGNED");
  });

  it("data quality delegation davranisi (ownerType, gerekce) degismez; confidence yalnizca decision varsa sinirlanir", () => {
    const failedStepsInput: ExecutiveDelegationEngineInput = {
      operatingContext: baseContext({ diagnostics: { failedSteps: ["paymentContext"], writeActions: [] } }),
      executiveDecisionResult: buildDecisionResult(buildDecision("CASH", "LOW")),
      currentUserName: "Ada",
      organizationMembershipRole: null,
    };
    const capped = buildExecutiveDelegationResult(failedStepsInput);
    expect(capped.ownerType).toBe("UNASSIGNED");
    expect(capped.responsibilityReason).toBe("Karar kalitesi eksik veya belirsiz bilgiye bağlı.");
    expect(capped.confidence).toBe("LOW");

    // Decision yokken (primaryDecision null) mevcut davranis (sabit HIGH) korunur.
    const withoutDecisionInput: ExecutiveDelegationEngineInput = {
      operatingContext: baseContext({ diagnostics: { failedSteps: ["paymentContext"], writeActions: [] } }),
      executiveDecisionResult: null,
      currentUserName: "Ada",
      organizationMembershipRole: null,
    };
    const uncapped = buildExecutiveDelegationResult(withoutDecisionInput);
    expect(uncapped.ownerType).toBe("UNASSIGNED");
    expect(uncapped.confidence).toBe("HIGH");
  });

  it("Responsibility Matrix, sinirlanmis delegation confidence'ini zincirde korur", () => {
    const highDelegationInput = strategyInput("HIGH");
    const highDelegation = buildExecutiveDelegationResult(highDelegationInput);
    const highMatrix = buildExecutiveResponsibilityMatrix({
      operatingContext: highDelegationInput.operatingContext,
      executiveDecisionResult: highDelegationInput.executiveDecisionResult,
      executiveDelegationResult: highDelegation,
    });
    expect(highDelegation.confidence).toBe("HIGH");
    expect(highMatrix.confidence).toBe("HIGH");

    const lowDelegationInput = strategyInput("LOW");
    const lowDelegation = buildExecutiveDelegationResult(lowDelegationInput);
    const lowMatrix = buildExecutiveResponsibilityMatrix({
      operatingContext: lowDelegationInput.operatingContext,
      executiveDecisionResult: lowDelegationInput.executiveDecisionResult,
      executiveDelegationResult: lowDelegation,
    });
    expect(lowDelegation.confidence).toBe("LOW");
    expect(lowMatrix.confidence).toBe("LOW");
    expect(lowMatrix.requiresOwnerClarification).toBe(true);
  });
});
