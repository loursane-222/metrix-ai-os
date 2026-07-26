import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildExecutiveAssessmentFromManagementPicture,
} from "..";
import type { ExecutiveBrainContext } from "@/lib/executive-brain/executive-brain.types";
import type { ExecutiveManagementPictureV1 } from "@/lib/executive-management-picture";

describe("ExecutiveAssessmentV1 contract and mapping", () => {
  it("creates a deeply immutable, versioned available contract from a picture", () => {
    const assessment = buildExecutiveAssessmentFromManagementPicture(picture({})).assessment;
    expect(assessment).toMatchObject({
      schemaVersion: "1.0",
      source: "executive_brain",
    });
    expect(Object.isFrozen(assessment)).toBe(true);
    expect(Object.isFrozen(assessment.evidence)).toBe(true);
  });

  it("separates sourced evidence from interpretive findings", () => {
    const context = {
      now: "2026-01-01T00:00:00.000Z",
      financeSignals: [{
        id: "payment:1",
        key: "payment_delay",
        value: "Customer payment is delayed",
        source: "events",
        confidence: 0.9,
      }],
    };
    const assessment = buildExecutiveAssessmentFromManagementPicture(picture(context)).assessment;
    expect(assessment.evidence[0]).toMatchObject({
      id: "payment:1",
      category: "finance",
      kind: "ACTION_RESULT",
    });
    expect(assessment.findings.every((finding) =>
      typeof finding.isAssumption === "boolean"
      && Array.isArray(finding.evidenceReferences))).toBe(true);
  });

  it("keeps risk and opportunity semantics canonical", () => {
    const context = {
      now: "2026-01-01T00:00:00.000Z",
      companySignals: [{
        id: "growth:1",
        key: "strategic_focus",
        value: "growth opportunity",
        source: "organization",
        confidence: 0.8,
      }],
    };
    const assessment = buildExecutiveAssessmentFromManagementPicture(picture(context)).assessment;
    expect(assessment.risks[0]).toEqual(expect.objectContaining({
      severity: expect.any(String),
      likelihood: expect.any(String),
      timeHorizon: expect.any(String),
      reversibility: expect.any(String),
      evidenceReferences: expect.any(Array),
      confidence: expect.any(String),
    }));
    expect(assessment.opportunities[0]).toEqual(expect.objectContaining({
      potentialValue: expect.any(String),
      probability: expect.any(String),
      timeWindow: expect.any(String),
      requiredConditions: expect.any(Array),
    }));
  });

  it.each(["priority", "risk", "finance", "operations"])(
    "produces no %s opinion when Picture is not assessment-ready",
    () => {
      const notReady = picture({
        companySignals: [{
          id: "company:name",
          key: "name",
          value: "Known Company",
          source: "organization",
          confidence: 1,
        }],
      }, false);
      const assessment =
        buildExecutiveAssessmentFromManagementPicture(notReady).assessment;

      expect(assessment).toMatchObject({
        source: "executive_brain",
        status: "PARTIAL",
        confidence: "LOW",
      });
      expect(assessment.evidence).toHaveLength(1);
      expect(assessment.findings).toEqual([]);
      expect(assessment.risks).toEqual([]);
      expect(assessment.opportunities).toEqual([]);
      expect(assessment.decisionFactors).toEqual([]);
      expect(assessment.evidenceGaps).toEqual(expect.arrayContaining([
        "memory", "people", "events",
      ]));
    },
  );
});

describe("ExecutiveAssessmentV1 ownership boundaries", () => {
  const contracts = readFileSync(
    new URL("../executive-assessment.contracts.ts", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL("../../../app/api/ai/chat/route.ts", import.meta.url),
    "utf8",
  );
  const gateway = readFileSync(
    new URL("../../ai/gateway/ai-gateway.ts", import.meta.url),
    "utf8",
  );
  const guidance = readFileSync(
    new URL("../../ai/living-executive-presence/executive-conversation-guidance.ts", import.meta.url),
    "utf8",
  );
  const council = readFileSync(
    new URL("../../executive-brain/executive-council.service.ts", import.meta.url),
    "utf8",
  );
  const decisionPackage = readFileSync(
    new URL("../../executive-brain/executive-decision-engine.service.ts", import.meta.url),
    "utf8",
  );

  it("owns no response, intent, behavior, tool, voice, approval, or persistence fields", () => {
    for (const forbidden of [
      "assistantMessage", "primaryIntent", "primaryBehavior", "toolName",
      "confirmationPolicy", "voiceDecision", "persistenceOwner",
    ]) {
      expect(contracts).not.toContain(`${forbidden}:`);
    }
  });

  it("is not read by Gateway or Conversation Guidance", () => {
    expect(gateway).not.toContain("ExecutiveAssessmentV1");
    expect(guidance).not.toContain("ExecutiveAssessmentV1");
  });

  it("makes Council a canonical assessment consumer, not a risk producer", () => {
    expect(council).toContain("ExecutiveAssessmentV1");
    expect(council).not.toContain("function buildRisksFromFindings");
    expect(council).not.toContain("function buildOpportunitiesFromRecommendations");
  });

  it("does not make Decision Package a second canonical assessment contract", () => {
    expect(decisionPackage).not.toContain("ExecutiveAssessmentV1");
    expect(decisionPackage).not.toContain("schemaVersion");
  });

  it("preserves one assistant owner and one text/voice producer", () => {
    expect(route.match(/await sendAiMessage\(\{/g)).toHaveLength(1);
    expect(route.match(/buildExecutiveAssessmentFromManagementPicture\(/g)).toHaveLength(1);
    expect(route).not.toContain('channel === "voice" ? buildExecutiveAssessmentFromManagementPicture');
  });
});

function picture(
  context: ExecutiveBrainContext,
  assessmentReady = true,
): ExecutiveManagementPictureV1 {
  return Object.freeze({
    schemaVersion: "executive-management-picture.v1",
    pictureId: "picture:test",
    organizationId: "org:test",
    generatedAt: "2026-01-01T00:00:00.000Z",
    conversation: {
      understanding: {
        conversationKind: "company_related",
        userMotivation: "bilgi_almak",
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
      ownerSignals: context.ownerSignals ?? [],
      companySignals: context.companySignals ?? [],
      customerSignals: context.customerSignals ?? [],
      personnelSignals: context.personnelSignals ?? [],
      salesSignals: context.salesSignals ?? [],
      financeSignals: context.financeSignals ?? [],
      operationsSignals: context.operationsSignals ?? [],
      memorySignals: context.memorySignals ?? [],
    },
    evidence: { sourceReliability: context.sourceReliability ?? [], evidenceGaps: [] },
    time: { now: "2026-01-01T00:00:00.000Z" },
    readiness: {
      assessmentReady,
      missingRequiredSources: assessmentReady ? [] : ["memory", "people", "events"],
    },
    confidence: { overall: 1, byDomain: {} },
  } satisfies ExecutiveManagementPictureV1);
}
