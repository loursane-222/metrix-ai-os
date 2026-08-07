import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildBaseMetrixPrompt } from "../prompt-format";
import type { BuildSystemPromptInput } from "../prompt.types";

const gatewaySource = readFileSync(
  resolve(process.cwd(), "src/lib/ai/gateway/ai-gateway.ts"),
  "utf8",
);
const routeSource = readFileSync(
  resolve(process.cwd(), "src/app/api/ai/chat/route.ts"),
  "utf8",
);

describe("single Executive prompt authority", () => {
  it("has no Executive Prompt Bridge producer or manager context", () => {
    expect(gatewaySource).not.toContain("buildExecutivePromptBridge");
    expect(gatewaySource).not.toContain("ExecutiveManagerContext");
    expect(gatewaySource).not.toContain("executiveManagerContext");
    expect(routeSource).toContain("executiveManagementPicture,");
    expect(routeSource).toContain("executiveAssessment,");
    expect(routeSource).toContain("executiveDirective,");
    expect(routeSource).toContain("executiveBehaviorPlan,");
  });

  it("serializes canonical evidence and ignores competing company context", () => {
    const prompt = buildBaseMetrixPrompt(canonicalInput());

    expect(prompt).toContain("executive-management-picture.v1");
    expect(prompt).toContain("companySignals: industry: Manufacturing");
    expect(prompt).toContain("Kanita dayali yonetim yorumu yok.");
    expect(prompt).not.toContain("LEGACY_FALSE_FINANCIAL_HEALTH");
    expect(prompt).not.toContain("LEGACY_FALSE_QUOTE_PIPELINE");
    expect(prompt).not.toContain("varsayimini acik soyle");
  });

  // Regression: this turn's real business-navigation/action evidence
  // (e.g. a canonical customer list lookup) must still reach the model on
  // the canonical prompt path, even though the legacy organizationSummary
  // heuristic stays excluded from it (see the test above).
  it("still delivers this turn's canonical operation evidence on the canonical path", () => {
    const prompt = buildBaseMetrixPrompt({
      ...canonicalInput(),
      canonicalOperationEvidence:
        "The customer names you must use when answering this turn: Atlas Insaat, Arda Yapi.",
    });

    expect(prompt).toContain("Atlas Insaat, Arda Yapi");
    expect(prompt).not.toContain("LEGACY_FALSE_FINANCIAL_HEALTH");
  });

  it("states plainly when no operation evidence exists for this turn, rather than omitting the section", () => {
    const prompt = buildBaseMetrixPrompt(canonicalInput());

    expect(prompt).toContain("BU TURUN ISLEM/NAVIGASYON KANITI");
    expect(prompt).toContain("Bu turda bir isletme navigasyonu veya islem sonucu yok.");
  });

  it("renders Decision Engine calibration when present and an explicit reversible fallback when absent", () => {
    const baselineInput = canonicalInput();
    const baselinePrompt = buildBaseMetrixPrompt(baselineInput);
    const calibratedPrompt = buildBaseMetrixPrompt({
      ...baselineInput,
      executiveDirective: {
        ...baselineInput.executiveDirective!,
        decisionCalibration: {
          primaryDecision: { category: "CASH", priority: "HIGH", confidence: 0.91 },
          supportingDecisions: [
            { category: "SALES", priority: "MEDIUM", confidence: 0.72 },
          ],
        },
      },
    });

    expect(baselinePrompt).toContain("Decision calibration (read-only): NONE.");
    expect(calibratedPrompt).toContain(
      "Decision calibration (read-only): primary=CASH/HIGH; confidence=0.91; supporting=SALES/MEDIUM/0.72.",
    );
  });
});

function canonicalInput(): BuildSystemPromptInput {
  const generatedAt = "2026-07-26T00:00:00.000Z";
  return {
    userMessage: "Önceliğimiz ne?",
    organizationSummary: "LEGACY_FALSE_FINANCIAL_HEALTH",
    memoryContext: {
      version: "v1",
      generatedAt,
      organizationId: "org",
      totalIncluded: 1,
      facts: [{
        id: "legacy",
        type: "FACT",
        key: "pipeline",
        value: "LEGACY_FALSE_QUOTE_PIPELINE",
        subjectType: "ORGANIZATION",
        subjectId: null,
        confidence: 1,
        source: "legacy",
        isUserConfirmed: false,
        createdAt: generatedAt,
        updatedAt: generatedAt,
      }],
      processes: [],
      strategic: [],
      preferences: [],
      highlights: [],
      conflicts: [],
    },
    executiveManagementPicture: {
      schemaVersion: "executive-management-picture.v1",
      pictureId: "picture",
      organizationId: "org",
      generatedAt,
      conversation: {
        understanding: {
          conversationKind: "company_related",
          userMotivation: "karar_destegi",
          companyRelevance: "high",
          actionExpectation: "none",
          confidence: "high",
          shouldAskClarification: false,
          shouldInvokeExecutiveBrain: true,
          suggestedHandling: "executive_reasoning",
          reasoning: { summary: "", observations: [], uncertainty: [], whyThisHandling: "" },
        },
        currentTurn: { messagePresent: true, channel: "text" },
      },
      managementReality: {
        ownerSignals: [],
        companySignals: [{
          id: "industry",
          key: "industry",
          value: "Manufacturing",
          source: "organization",
          confidence: 1,
        }],
        customerSignals: [],
        personnelSignals: [],
        salesSignals: [],
        financeSignals: [],
        operationsSignals: [],
        memorySignals: [],
      },
      evidence: { sourceReliability: [], evidenceGaps: ["finance"] },
      time: { now: generatedAt },
      readiness: { assessmentReady: false, missingRequiredSources: ["finance"] },
      confidence: { overall: 0.2, byDomain: { organization: 1 } },
    },
    executiveAssessment: {
      schemaVersion: "1.0",
      assessmentId: "assessment",
      source: "executive_brain",
      status: "PARTIAL",
      evidence: [],
      findings: [],
      risks: [],
      opportunities: [],
      tradeoffs: [],
      decisionFactors: [],
      timeImpact: { immediate: [], nearTerm: [], longTerm: [] },
      evidenceGaps: ["finance"],
      confidence: "LOW",
      generatedAt,
    },
    executiveDirective: {
      schemaVersion: "1.0",
      source: "conversation_understanding_and_assessment",
      primaryIntent: "karar_destegi",
      interventionLevel: "executive_reasoning",
      authorityMode: "CLARIFICATION",
      actionStrategy: null,
      confirmationPolicy: "NONE",
      reasoningMode: "ASSESSMENT_INFORMED",
      requiresExecutiveReasoning: true,
      confidence: "low",
      decisionCalibration: null,
    },
    executiveBehaviorPlan: {
      schemaVersion: "1.0",
      source: "executive_directive",
      primaryBehavior: "CLARIFY",
      interactionPosture: "CURIOUS",
      questionPolicy: "SINGLE_NECESSARY_QUESTION",
      explanationPolicy: "BRIEF",
      challengePolicy: "NONE",
      pacingIntent: "MEASURED",
      requiresExecutiveReasoning: true,
      confidence: "LOW",
    },
  };
}
