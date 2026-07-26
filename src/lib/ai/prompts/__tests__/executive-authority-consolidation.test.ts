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
