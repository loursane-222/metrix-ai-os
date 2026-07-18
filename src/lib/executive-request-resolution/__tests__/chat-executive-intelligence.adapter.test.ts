import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/memory/memory-context-builder.service", () => ({
  buildMemoryContextForOrganization: vi.fn(),
}));
vi.mock("@/lib/executive-intelligence", () => ({
  buildExecutiveIntelligence: vi.fn(),
}));

import {
  buildChatExecutiveIntelligence,
  type ChatExecutiveIntelligenceDependencies,
} from "@/lib/ai/chat-executive-intelligence.adapter";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import type { ExecutiveIntelligenceResult } from "@/lib/executive-intelligence";

const sourceUnderstanding: ConversationUnderstanding = {
  conversationKind: "company_related",
  userMotivation: "karar_destegi",
  companyRelevance: "high",
  actionExpectation: "none",
  confidence: "high",
  shouldAskClarification: false,
  shouldInvokeExecutiveBrain: true,
  suggestedHandling: "executive_reasoning",
  reasoning: {
    summary: "Decision support.",
    observations: [],
    uncertainty: [],
    whyThisHandling: "Executive analysis requested.",
  },
};

const intelligenceResult: ExecutiveIntelligenceResult = {
  understanding: sourceUnderstanding,
  executiveOperatingSystem: null,
  diagnostics: {
    requiresExecutiveReasoning: true,
    skippedReason: null,
    understanding: { status: "success" },
    context: { status: "skipped" },
    companyModel: { status: "skipped" },
    eos: { status: "skipped" },
  },
};

function dependencies(overrides: Partial<ChatExecutiveIntelligenceDependencies> = {}) {
  const defaults: ChatExecutiveIntelligenceDependencies = {
    buildMemoryContext: vi.fn(async () => null),
    buildIntelligence: vi.fn(async () => intelligenceResult),
    recordDuplicateClassification: vi.fn(() => ({
      event: "duplicate_classification_scheduled",
      requestId: "request-1",
      channel: "text",
      upstreamUnderstandingAvailable: true,
      behaviorChanged: false,
    } as const)),
  };
  return { ...defaults, ...overrides };
}

const baseInput = {
  organizationId: "org-1",
  message: "Safe fixture message",
  generatedAt: "2026-01-01T00:00:00.000Z",
} as const;

describe("buildChatExecutiveIntelligence shadow diagnostic seam", () => {
  it("records duplicate classification immediately before intelligence build", async () => {
    const order: string[] = [];
    const deps = dependencies({
      recordDuplicateClassification: vi.fn(() => {
        order.push("diagnostic");
        return {
          event: "duplicate_classification_scheduled",
          requestId: "request-1",
          channel: "text",
          upstreamUnderstandingAvailable: true,
          behaviorChanged: false,
        } as const;
      }),
      buildIntelligence: vi.fn(async () => {
        order.push("intelligence");
        return intelligenceResult;
      }),
    });

    const result = await buildChatExecutiveIntelligence({
      ...baseInput,
      diagnosticContext: {
        requestId: "request-1",
        channel: "text",
        upstreamUnderstandingAvailable: true,
      },
    }, deps);

    expect(order).toEqual(["diagnostic", "intelligence"]);
    expect(result).toBe(intelligenceResult);
  });

  it("does not record when diagnostic context is absent", async () => {
    const deps = dependencies();

    await buildChatExecutiveIntelligence(baseInput, deps);

    expect(deps.recordDuplicateClassification).not.toHaveBeenCalled();
    expect(deps.buildIntelligence).toHaveBeenCalledOnce();
  });

  it("continues intelligence build when diagnostic recording throws", async () => {
    const deps = dependencies({
      recordDuplicateClassification: vi.fn(() => {
        throw new Error("diagnostic unavailable");
      }),
    });

    const result = await buildChatExecutiveIntelligence({
      ...baseInput,
      diagnosticContext: {
        requestId: "request-2",
        channel: "voice",
        upstreamUnderstandingAvailable: true,
      },
    }, deps);

    expect(result).toBe(intelligenceResult);
    expect(deps.buildIntelligence).toHaveBeenCalledOnce();
  });
});
