import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import type { ExecutiveAssessmentV1 } from "@/lib/executive-assessment";
import type { ExecutiveManagementPictureV1 } from "@/lib/executive-management-picture";
import type { ExecutiveDirectiveV1 } from "@/lib/ai/executive-directive";
import type { ExecutiveBehaviorPlanV1 } from "@/lib/ai/living-executive-presence";
import {
  createExecutiveRuntimeTraceV1,
  type ExecutiveRuntimeTraceChannelV1,
} from "..";

const understanding: ConversationUnderstanding = {
  conversationKind: "company_related",
  userMotivation: "karar_destegi",
  companyRelevance: "high",
  actionExpectation: "none",
  confidence: "high",
  shouldAskClarification: true,
  shouldInvokeExecutiveBrain: true,
  suggestedHandling: "ask_clarification",
  reasoning: {
    summary: "RAW-USER-CANARY",
    observations: [],
    uncertainty: [],
    whyThisHandling: "",
  },
};

const directive: ExecutiveDirectiveV1 = {
  schemaVersion: "1.0",
  source: "conversation_understanding_and_assessment",
  primaryIntent: "karar_destegi",
  interventionLevel: "ask_clarification",
  authorityMode: "CLARIFICATION",
  actionStrategy: null,
  confirmationPolicy: "NONE",
  reasoningMode: "ASSESSMENT_INFORMED",
  requiresExecutiveReasoning: true,
  confidence: "low",
  decisionCalibration: null,
};

const behavior: ExecutiveBehaviorPlanV1 = {
  schemaVersion: "1.0",
  source: "executive_directive",
  primaryBehavior: "CLARIFY",
  interactionPosture: "CURIOUS",
  questionPolicy: "SINGLE_NECESSARY_QUESTION",
  explanationPolicy: "BRIEF",
  challengePolicy: "NONE",
  pacingIntent: "CONCISE",
  requiresExecutiveReasoning: true,
  confidence: "LOW",
};

describe("ExecutiveRuntimeTraceV1", () => {
  it.each(["text", "voice"] satisfies ExecutiveRuntimeTraceChannelV1[])(
    "combines all canonical stages under one correlation for %s",
    (channel) => {
      const logger = vi.fn();
      const collector = createExecutiveRuntimeTraceV1(identity(channel), logger);

      observeCanonicalChain(collector, false);
      const response = "Eksik bilgi var; hangi finans verisini paylaşabilirsiniz?";
      const trace = collector.finalizeResponse(response, 42);
      collector.finalizeResponse("SECOND-RAW-ASSISTANT", 99);

      expect(logger).toHaveBeenCalledTimes(1);
      expect(logger).toHaveBeenCalledWith("executive_runtime_trace_v1", trace);
      expect(trace).toMatchObject({
        schemaVersion: "executive-runtime-trace.v1",
        requestId: "req-1",
        correlationId: "correlation-1",
        turnId: "turn-1",
        conversationId: "conversation-1",
        organizationId: "organization-1",
        channel,
        managementPictureSummary: { assessmentReady: false },
        assessmentSummary: {
          findingCount: 0,
          riskCount: 0,
          opportunityCount: 0,
        },
        directiveSummary: { authorityMode: "CLARIFICATION" },
        behaviorPlanSummary: { primaryBehavior: "CLARIFY" },
        canonicalPromptSummary: {
          noEvidenceInstructionPresent: true,
          legacyAuthoritySectionPresent: false,
        },
        responseSummary: {
          clarificationLikeResponseDetected: true,
        },
      });
      expect(Object.isFrozen(trace)).toBe(true);
      expect(Object.isFrozen(trace.managementPictureSummary.signalCountsByDomain)).toBe(true);
    },
  );

  it("never logs raw user, prompt, response, cookie, or token content", () => {
    const logger = vi.fn();
    const collector = createExecutiveRuntimeTraceV1(identity("text"), logger);
    observeCanonicalChain(collector, false, [
      "RAW-SYSTEM-PROMPT-CANARY",
      "cookie=RAW-COOKIE-CANARY",
      "authorization=RAW-TOKEN-CANARY",
    ].join("\n"));
    collector.finalizeResponse("RAW-ASSISTANT-RESPONSE-CANARY", 55);

    const serialized = JSON.stringify(logger.mock.calls[0]);
    for (const forbidden of [
      "RAW-USER-CANARY",
      "RAW-SYSTEM-PROMPT-CANARY",
      "RAW-ASSISTANT-RESPONSE-CANARY",
      "RAW-COOKIE-CANARY",
      "RAW-TOKEN-CANARY",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("uses deterministic hashes and exposes normal evidence-bearing assessment", () => {
    const first = createExecutiveRuntimeTraceV1(identity("text"), vi.fn());
    const second = createExecutiveRuntimeTraceV1(identity("text"), vi.fn());
    observeCanonicalChain(first, true);
    observeCanonicalChain(second, true);

    const firstTrace = first.finalizeResponse("Öncelik kanıtlı bulgudur.", 60);
    const secondTrace = second.finalizeResponse("Öncelik kanıtlı bulgudur.", 60);

    expect(firstTrace.canonicalPromptSummary.promptHash)
      .toBe(secondTrace.canonicalPromptSummary.promptHash);
    expect(firstTrace.responseSummary.responseHash)
      .toBe(secondTrace.responseSummary.responseHash);
    expect(firstTrace.assessmentSummary).toMatchObject({
      status: "AVAILABLE",
      findingCount: 1,
      riskCount: 1,
    });
    expect(firstTrace.canonicalPromptSummary.assessmentFindingsCount).toBe(1);
    expect(firstTrace.responseSummary.recommendationLikeClaimDetected).toBe(true);
  });

  it("is request-owned in the canonical route and cannot finalize post-stream twice", () => {
    const route = readFileSync(
      new URL("../../../../app/api/ai/chat/route.ts", import.meta.url),
      "utf8",
    );
    const gateway = readFileSync(
      new URL("../../gateway/ai-gateway.ts", import.meta.url),
      "utf8",
    );

    expect(route.match(/createExecutiveRuntimeTraceV1\(\{/g)).toHaveLength(1);
    expect(route.match(/executiveRuntimeTrace\.finalizeResponse\(/g)).toHaveLength(1);
    expect(route).toContain("streamHandle.pre.systemPrompt");
    expect(route).toContain("onExecutiveConversationGuidanceObserved:");
    expect(gateway).toContain(
      "input.onExecutiveConversationGuidanceObserved?.(executiveConversationGuidance)",
    );
  });
});

function identity(channel: ExecutiveRuntimeTraceChannelV1) {
  return {
    requestId: "req-1",
    correlationId: "correlation-1",
    turnId: "turn-1",
    conversationId: "conversation-1",
    organizationId: "organization-1",
    channel,
    createdAt: "2026-07-27T00:00:00.000Z",
  } as const;
}

function observeCanonicalChain(
  collector: ReturnType<typeof createExecutiveRuntimeTraceV1>,
  ready: boolean,
  promptSuffix = "",
): void {
  collector.observeConversationUnderstanding(understanding, 1);
  collector.observeManagementPicture(picture(ready), 2);
  collector.observeAssessment(assessment(ready), 3);
  collector.observeDirective(ready ? { ...directive, authorityMode: "RESPONSE_ONLY" } : directive, 1);
  collector.observeBehaviorPlan(
    ready ? { ...behavior, primaryBehavior: "GUIDE", questionPolicy: "NONE" } : behavior,
    1,
  );
  collector.observeConversationGuidance("SAFE GUIDANCE", 1);
  collector.observeCanonicalPrompt([
    "CANONICAL EXECUTIVE AUTHORITY:",
    "KANITLANMIS YONETIM GERCEKLIGI:",
    "CANONICAL ASSESSMENT FINDINGS:",
    ready ? "- finance: finding [evidence=evidence-1]" : "- Kanita dayali yonetim yorumu yok.",
    "EKSIK YONETIM KANITLARI:",
    "- ready=false veya finding yoksa yonetim kanaati verme",
    promptSuffix,
  ].join("\n"), 4);
}

function picture(ready: boolean): ExecutiveManagementPictureV1 {
  const financeSignals = ready
    ? [{ id: "finance-1", key: "overdue_count", value: "4", source: "events" }]
    : [];
  return {
    schemaVersion: "executive-management-picture.v1",
    pictureId: "picture-1",
    organizationId: "organization-1",
    conversationId: "conversation-1",
    requestId: "req-1",
    generatedAt: "2026-07-27T00:00:00.000Z",
    conversation: { understanding, currentTurn: { messagePresent: true, channel: "text" } },
    managementReality: {
      ownerSignals: [],
      companySignals: [],
      customerSignals: [],
      personnelSignals: [],
      salesSignals: [],
      financeSignals,
      operationsSignals: [],
      memorySignals: [],
    },
    evidence: {
      sourceReliability: [{
        source: "events",
        reliability: ready ? "HIGH" : "UNAVAILABLE",
        confidence: ready ? 1 : 0,
        connected: ready,
        reason: "RAW-COMPANY-DATA-CANARY",
        signalCount: financeSignals.length,
      }],
      evidenceGaps: ready ? [] : ["finance", "RAW GAP WITH PRIVATE DATA"],
    },
    time: { now: "2026-07-27T00:00:00.000Z" },
    readiness: {
      assessmentReady: ready,
      missingRequiredSources: ready ? [] : ["finance"],
    },
    confidence: { overall: ready ? 0.9 : 0.1, byDomain: { finance: ready ? 0.9 : 0 } },
  };
}

function assessment(ready: boolean): ExecutiveAssessmentV1 {
  return {
    schemaVersion: "1.0",
    assessmentId: "assessment-1",
    source: "executive_brain",
    status: ready ? "AVAILABLE" : "PARTIAL",
    evidence: [],
    findings: ready ? [{
      id: "finding.finance.overdue",
      category: "finance",
      severity: "HIGH",
      summary: "RAW-FINDING-CANARY",
      evidenceReferences: ["evidence-1"],
      confidence: "HIGH",
      isAssumption: false,
    }] : [],
    risks: ready ? [{
      id: "risk-1",
      category: "finance",
      severity: "HIGH",
      likelihood: "HIGH",
      timeHorizon: "IMMEDIATE",
      reversibility: "REVERSIBLE",
      evidenceReferences: ["evidence-1"],
      confidence: "HIGH",
    }] : [],
    opportunities: [],
    tradeoffs: [],
    decisionFactors: [],
    timeImpact: { immediate: [], nearTerm: [], longTerm: [] },
    evidenceGaps: ready ? [] : ["finance"],
    confidence: ready ? "HIGH" : "LOW",
    generatedAt: "2026-07-27T00:00:00.000Z",
  };
}
