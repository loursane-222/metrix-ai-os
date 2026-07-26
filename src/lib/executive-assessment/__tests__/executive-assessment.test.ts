import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildExecutiveAssessment } from "@/lib/executive-brain/executive-brain-assessment.service";
import {
  adaptExecutiveBrainAssessmentV1,
  buildUnavailableExecutiveAssessmentV1,
} from "..";

describe("ExecutiveAssessmentV1 contract and mapping", () => {
  it("creates a deeply immutable, versioned unavailable contract", () => {
    const assessment = buildUnavailableExecutiveAssessmentV1("2026-01-01T00:00:00.000Z");
    expect(assessment).toMatchObject({
      schemaVersion: "1.0",
      source: "unavailable",
      status: "UNAVAILABLE",
      confidence: "LOW",
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
    const assessment = adaptExecutiveBrainAssessmentV1({
      context,
      assessment: buildExecutiveAssessment(context),
    });
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
    const assessment = adaptExecutiveBrainAssessmentV1({
      context,
      assessment: buildExecutiveAssessment(context),
    });
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
    expect(route.match(/adaptExecutiveBrainAssessmentV1\(\{/g)).toHaveLength(1);
    expect(route).not.toContain('channel === "voice" ? adaptExecutiveBrainAssessmentV1');
  });
});
