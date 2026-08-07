import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import {
  freezeExecutiveAssessmentV1,
} from "@/lib/executive-assessment";
import { adaptExecutiveDirectiveToExecutiveBehaviorPlan } from "@/lib/ai/living-executive-presence";
import { resolveExecutiveDirective } from "..";

const understanding = (
  overrides: Partial<ConversationUnderstanding> = {},
): ConversationUnderstanding => ({
  conversationKind: "company_related",
  userMotivation: "bilgi_almak",
  companyRelevance: "medium",
  actionExpectation: "none",
  confidence: "high",
  shouldAskClarification: false,
  shouldInvokeExecutiveBrain: false,
  suggestedHandling: "answer_only",
  reasoning: { summary: "", observations: [], uncertainty: [], whyThisHandling: "" },
  ...overrides,
});

const unavailableAssessment = () => freezeExecutiveAssessmentV1({
  schemaVersion: "1.0",
  assessmentId: "test-assessment",
  source: "unavailable",
  status: "UNAVAILABLE",
  evidence: [],
  findings: [],
  risks: [],
  opportunities: [],
  tradeoffs: [],
  decisionFactors: [],
  timeImpact: { immediate: [], nearTerm: [], longTerm: [] },
  evidenceGaps: [],
  confidence: "LOW",
  generatedAt: "2026-01-01T00:00:00.000Z",
});

describe("ExecutiveDirectiveV1 schema and deterministic resolution", () => {
  it.each([
    [{ userMotivation: "sohbet_etmek", conversationKind: "general_chat", companyRelevance: "none" }, "ANSWER", "RESPONSE_ONLY", "NONE"],
    [{ userMotivation: "bilgi_almak" }, "READ", "RESPONSE_ONLY", "NONE"],
    [{ userMotivation: "karar_destegi", suggestedHandling: "executive_reasoning", shouldInvokeExecutiveBrain: true }, "ANALYZE", "READ_ONLY", "NONE"],
    [{ shouldAskClarification: true, suggestedHandling: "ask_clarification" }, null, "CLARIFICATION", "NONE"],
    [{ userMotivation: "kayit_islem", actionExpectation: "explicit", shouldInvokeExecutiveBrain: true }, "WORKFLOW", "DRAFT", "CONFIRM_BEFORE_ACTION"],
    [{ suggestedHandling: "passive_note" }, "READ", "DEFERRED", "NONE"],
  ] as const)("maps existing runtime semantics: %#", (overrides, strategy, mode, confirmation) => {
    const sourceUnderstanding = understanding(overrides);
    expect(resolveExecutiveDirective({ understanding: sourceUnderstanding })).toMatchObject({
      schemaVersion: "1.0",
      source: "conversation_understanding",
      primaryIntent: sourceUnderstanding.userMotivation,
      actionStrategy: strategy,
      authorityMode: mode,
      confirmationPolicy: confirmation,
      reasoningMode: "DETERMINISTIC",
    });
  });

  it("keeps working when Executive Assessment is unavailable", () => {
    const directive = resolveExecutiveDirective({
      understanding: understanding({ shouldInvokeExecutiveBrain: true }),
      assessment: null,
    });
    expect(directive.source).toBe("conversation_understanding");
    expect(directive.reasoningMode).toBe("DETERMINISTIC");
    expect(directive.requiresExecutiveReasoning).toBe(true);
  });

  it("records assessment use without allowing it to replace upstream intent", () => {
    const unavailable = unavailableAssessment();
    const assessment = freezeExecutiveAssessmentV1({
      ...unavailable,
      source: "executive_brain",
      status: "AVAILABLE",
      confidence: "HIGH",
      risks: [{
        id: "risk:finance",
        category: "finance",
        severity: "HIGH",
        likelihood: "HIGH",
        timeHorizon: "IMMEDIATE",
        reversibility: "PARTIALLY_REVERSIBLE",
        evidenceReferences: [],
        confidence: "HIGH",
      }],
      timeImpact: { immediate: ["risk:finance"], nearTerm: [], longTerm: [] },
    });
    const directive = resolveExecutiveDirective({
      understanding: understanding({ userMotivation: "bilgi_almak" }),
      assessment,
    });
    expect(directive).toMatchObject({
      source: "conversation_understanding_and_assessment",
      primaryIntent: "bilgi_almak",
      reasoningMode: "ASSESSMENT_INFORMED",
      actionStrategy: "ANALYZE",
      authorityMode: "READ_ONLY",
    });
  });

  it("keeps unavailable canonical assessment on deterministic fallback", () => {
    const directive = resolveExecutiveDirective({
      understanding: understanding({ shouldInvokeExecutiveBrain: true }),
      assessment: unavailableAssessment(),
    });
    expect(directive).toMatchObject({
      source: "conversation_understanding",
      reasoningMode: "DETERMINISTIC",
    });
  });

  it("carries decision calibration to the directive without changing its authority or behavior", () => {
    const sourceUnderstanding = understanding({
      userMotivation: "bilgi_almak",
      suggestedHandling: "answer_only",
    });
    const baseline = resolveExecutiveDirective({ understanding: sourceUnderstanding });
    const calibrated = resolveExecutiveDirective({
      understanding: sourceUnderstanding,
      decisionCalibration: {
        primaryDecision: { category: "CASH", priority: "HIGH", confidence: 0.91 },
        supportingDecisions: [
          { category: "SALES", priority: "MEDIUM", confidence: 0.72 },
        ],
      },
    });
    const { decisionCalibration: baselineCalibration, ...baselineAuthority } = baseline;
    const { decisionCalibration: calibratedSignal, ...calibratedAuthority } = calibrated;

    expect(baselineCalibration).toBeNull();
    expect(calibratedSignal).toEqual({
      primaryDecision: { category: "CASH", priority: "HIGH", confidence: 0.91 },
      supportingDecisions: [
        { category: "SALES", priority: "MEDIUM", confidence: 0.72 },
      ],
    });
    expect(calibratedAuthority).toEqual(baselineAuthority);
    expect(adaptExecutiveDirectiveToExecutiveBehaviorPlan(calibrated)).toEqual(
      adaptExecutiveDirectiveToExecutiveBehaviorPlan(baseline),
    );
  });

  it("limits intervention and confidence for partial evidence gaps", () => {
    const unavailable = unavailableAssessment();
    const partial = freezeExecutiveAssessmentV1({
      ...unavailable,
      source: "executive_brain",
      status: "PARTIAL",
      confidence: "LOW",
      evidenceGaps: ["cashflow_priority"],
    });
    const directive = resolveExecutiveDirective({
      understanding: understanding({
        userMotivation: "karar_destegi",
        suggestedHandling: "executive_reasoning",
        confidence: "high",
      }),
      assessment: partial,
    });
    expect(directive).toMatchObject({
      authorityMode: "CLARIFICATION",
      actionStrategy: null,
      confidence: "low",
      reasoningMode: "ASSESSMENT_INFORMED",
    });
  });

  it("asks for evidence instead of explaining when executive assessment is partial", () => {
    const partial = freezeExecutiveAssessmentV1({
      ...unavailableAssessment(),
      source: "executive_brain",
      status: "PARTIAL",
      evidenceGaps: ["finance", "operations"],
    });
    const directive = resolveExecutiveDirective({
      understanding: understanding({
        userMotivation: "bilgi_almak",
        shouldInvokeExecutiveBrain: true,
      }),
      assessment: partial,
    });

    expect(directive).toMatchObject({
      source: "conversation_understanding_and_assessment",
      authorityMode: "CLARIFICATION",
      actionStrategy: null,
      reasoningMode: "ASSESSMENT_INFORMED",
      confidence: "low",
    });
  });

  it("contains no response, behavior, tool, capability or persistence ownership", () => {
    const directive = resolveExecutiveDirective({ understanding: understanding() });
    expect(Object.keys(directive).sort()).toEqual([
      "actionStrategy", "authorityMode", "confidence", "confirmationPolicy",
      "interventionLevel", "primaryIntent", "reasoningMode",
      "requiresExecutiveReasoning", "schemaVersion", "source", "decisionCalibration",
    ].sort());
    for (const forbidden of [
      "content", "response", "primaryBehavior", "tool", "toolName",
      "capabilityId", "assistantMessage", "actionType",
    ]) {
      expect(directive).not.toHaveProperty(forbidden);
    }
    expect(Object.isFrozen(directive)).toBe(true);
  });
});

describe("Executive Directive single authority and channel parity", () => {
  const route = readFileSync(
    new URL("../../../../app/api/ai/chat/route.ts", import.meta.url),
    "utf8",
  );
  const gateway = readFileSync(
    new URL("../../gateway/ai-gateway.ts", import.meta.url),
    "utf8",
  );
  const guidance = readFileSync(
    new URL("../../living-executive-presence/executive-conversation-guidance.ts", import.meta.url),
    "utf8",
  );
  const behaviorAdapter = readFileSync(
    new URL("../../living-executive-presence/executive-behavior-plan.adapter.ts", import.meta.url),
    "utf8",
  );

  it("resolves one directive before one behavior plan for both voice and text", () => {
    expect(route.match(/resolveExecutiveDirective\(\{/g)).toHaveLength(1);
    expect(route.indexOf("resolveExecutiveDirective({")).toBeLessThan(
      route.indexOf("adaptExecutiveDirectiveToExecutiveBehaviorPlan("),
    );
    expect(route).not.toContain('channel === "voice" ? resolveExecutiveDirective');
    expect(behaviorAdapter).toContain("ExecutiveDirectiveV1");
    expect(behaviorAdapter).not.toContain("ConversationUnderstanding");
  });

  it("lets gateway serialize but never resolve Directive", () => {
    expect(gateway).not.toContain("ExecutiveDirective");
    expect(gateway).toContain("executiveDirective: input.executiveDirective");
    expect(gateway).not.toContain("resolveExecutiveDirective");
    expect(guidance).not.toContain("ExecutiveDirective");
    expect(guidance).not.toContain("executiveDirective");
  });

  it("keeps canonical response and assistant owners unchanged", () => {
    expect(route).toContain("streamWithAiGateway");
    expect(route.match(/await sendAiMessage\(\{/g)).toHaveLength(1);
    expect(route).not.toContain("sendDirectiveMessage");
  });

  it("emits content-free directive telemetry", () => {
    expect(route).toContain("executive_directive_resolved");
    expect(route).toContain("executive_directive_projected");
    const telemetry = route.slice(
      route.indexOf('console.info("executive_directive_resolved"'),
      route.indexOf("const livingBehaviorHint"),
    );
    expect(telemetry).not.toContain("message,");
    expect(telemetry).not.toContain("userMessage");
  });
});
