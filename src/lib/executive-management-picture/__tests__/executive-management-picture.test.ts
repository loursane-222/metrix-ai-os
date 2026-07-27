import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutiveBrainContext } from "@/lib/executive-brain/executive-brain.types";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";

const mocks = vi.hoisted(() => ({
  context: {} as ExecutiveBrainContext,
}));

vi.mock("@/lib/executive-brain/executive-brain-context-builder.service", () => ({
  buildExecutiveBrainContext: vi.fn(async () => mocks.context),
}));

import { buildExecutiveManagementPictureV1 } from "..";

const understanding: ConversationUnderstanding = {
  conversationKind: "company_related",
  userMotivation: "karar_destegi",
  companyRelevance: "high",
  actionExpectation: "none",
  confidence: "high",
  shouldAskClarification: false,
  shouldInvokeExecutiveBrain: true,
  suggestedHandling: "executive_reasoning",
  reasoning: { summary: "", observations: [], uncertainty: [], whyThisHandling: "" },
};

describe("ExecutiveManagementPictureV1 readiness", () => {
  beforeEach(() => {
    mocks.context = {
      sourceReliability: ["organization", "customers", "quotes", "payments"].map((source) => ({
        source,
        connected: true,
        domainState: "EMPTY",
        reliability: "LOW",
        confidence: 0.2,
        reason: "Empty canonical source.",
        signalCount: 0,
      })),
    };
  });

  it("treats connected empty domains as healthy and assessment-ready", async () => {
    const picture = await buildExecutiveManagementPictureV1({
      organizationId: "org-empty",
      understanding,
      channel: "text",
      messagePresent: true,
    });

    expect(picture.schemaVersion).toBe("executive-management-picture.v1");
    expect(picture.readiness.assessmentReady).toBe(true);
    expect(picture.readiness.missingRequiredSources).toEqual([]);
    expect(picture.evidence.evidenceGaps).toEqual([
      "organization:empty", "customers:empty", "quotes:empty", "payments:empty",
    ]);
    expect(Object.isFrozen(picture)).toBe(true);
    expect(Object.isFrozen(picture.managementReality)).toBe(true);
  });

  it("remains assessment-ready when every required source has evidence", async () => {
    mocks.context = {
      sourceReliability: ["organization", "customers", "quotes", "payments"].map((source) => ({
        source,
        connected: true,
        domainState: "AVAILABLE",
        reliability: "HIGH",
        confidence: 0.9,
        reason: "Canonical evidence loaded.",
        signalCount: 1,
      })),
    };

    const picture = await buildExecutiveManagementPictureV1({
      organizationId: "org-known",
      understanding,
      channel: "voice",
      messagePresent: true,
    });

    expect(picture.readiness).toEqual({
      assessmentReady: true,
      missingRequiredSources: [],
    });
  });
});
