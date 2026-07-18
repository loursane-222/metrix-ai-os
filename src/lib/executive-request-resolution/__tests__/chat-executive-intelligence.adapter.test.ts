import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/memory/memory-context-builder.service", () => ({
  buildMemoryContextForOrganization: vi.fn(),
}));
vi.mock("@/lib/executive-intelligence", () => ({
  buildExecutiveIntelligence: vi.fn(),
}));

import {
  buildChatExecutiveCognitionObservation,
  buildChatExecutiveIntelligence,
  resolveChatExecutiveCognition,
  type ChatExecutiveIntelligenceInput,
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
  };
  return { ...defaults, ...overrides };
}

const baseInput = {
  organizationId: "org-1",
  message: "Safe fixture message",
  generatedAt: "2026-01-01T00:00:00.000Z",
  understanding: sourceUnderstanding,
} as const;

describe("buildChatExecutiveIntelligence understanding authority", () => {
  it("passes the exact authoritative understanding to intelligence", async () => {
    const deps = dependencies();

    const result = await buildChatExecutiveIntelligence(baseInput, deps);

    expect(deps.buildIntelligence).toHaveBeenCalledWith(expect.objectContaining({
      understanding: sourceUnderstanding,
    }));
    expect(vi.mocked(deps.buildIntelligence).mock.calls[0]?.[0].understanding).toBe(sourceUnderstanding);
    expect(result).toBe(intelligenceResult);
  });

  it("preserves memory context construction", async () => {
    const memoryContext = { organizationId: "org-1" } as never;
    const deps = dependencies({ buildMemoryContext: vi.fn(async () => memoryContext) });

    await buildChatExecutiveIntelligence(baseInput, deps);

    expect(deps.buildMemoryContext).toHaveBeenCalledWith({ organizationId: "org-1" });
    expect(deps.buildIntelligence).toHaveBeenCalledWith(expect.objectContaining({ memoryContext }));
  });

  it("returns null when intelligence construction fails", async () => {
    const deps = dependencies({
      buildIntelligence: vi.fn(async () => { throw new Error("intelligence failed"); }),
    });

    await expect(buildChatExecutiveIntelligence(baseInput, deps)).resolves.toBeNull();
  });
});

describe("resolveChatExecutiveCognition consumption contract", () => {
  it("skips generation when the authoritative understanding does not require reasoning", async () => {
    const buildIntelligence = vi.fn();
    const understanding = {
      ...sourceUnderstanding,
      shouldInvokeExecutiveBrain: false,
      suggestedHandling: "answer_only" as const,
    };

    const result = await resolveChatExecutiveCognition(
      { ...baseInput, understanding },
      buildIntelligence,
    );

    expect(buildIntelligence).not.toHaveBeenCalled();
    expect(result.status).toBe("skipped_not_required");
    expect(result.understanding).toBe(understanding);
    expect(result.executiveOperatingSystem).toBeNull();
  });

  it("passes the exact understanding in and the exact EOS reference out once", async () => {
    const eos = { generatedAt: baseInput.generatedAt } as NonNullable<
      ExecutiveIntelligenceResult["executiveOperatingSystem"]
    >;
    const generated = { ...intelligenceResult, executiveOperatingSystem: eos };
    const buildIntelligence = vi.fn<
      (input: ChatExecutiveIntelligenceInput) => Promise<ExecutiveIntelligenceResult>
    >(async () => generated);

    const result = await resolveChatExecutiveCognition(baseInput, buildIntelligence);

    expect(buildIntelligence).toHaveBeenCalledTimes(1);
    expect(buildIntelligence.mock.calls[0]?.[0].understanding).toBe(sourceUnderstanding);
    expect(result.understanding).toBe(sourceUnderstanding);
    expect(result.executiveOperatingSystem).toBe(eos);
    expect(result.status).toBe("generated_and_consumed");
  });

  it("falls back to null when generation returns null", async () => {
    const result = await resolveChatExecutiveCognition(baseInput, vi.fn(async () => null));

    expect(result.status).toBe("generation_failed_fallback_null");
    expect(result.executiveOperatingSystem).toBeNull();
  });

  it("falls back to null when generation rejects", async () => {
    const result = await resolveChatExecutiveCognition(
      baseInput,
      vi.fn(async () => { throw new Error("generation failed"); }),
    );

    expect(result.status).toBe("generation_failed_fallback_null");
    expect(result.executiveOperatingSystem).toBeNull();
  });

  it("marks a typed intelligence result without EOS as unavailable", async () => {
    const result = await resolveChatExecutiveCognition(
      baseInput,
      vi.fn(async () => intelligenceResult),
    );

    expect(result.status).toBe("unavailable");
    expect(result.diagnostics).toBe(intelligenceResult.diagnostics);
  });

  it("builds bounded, JSON-safe observation metadata", () => {
    const eos = {
      generatedAt: baseInput.generatedAt,
      reasoning: {
        confidence: 0.81,
        summary: "x".repeat(400),
        timing: { urgency: "immediate" },
      },
      recommendedNextMove: { title: "y".repeat(240) },
    } as NonNullable<ExecutiveIntelligenceResult["executiveOperatingSystem"]>;

    const observation = buildChatExecutiveCognitionObservation({
      understanding: sourceUnderstanding,
      executiveOperatingSystem: eos,
      diagnostics: intelligenceResult.diagnostics,
      status: "generated_and_consumed",
    });

    expect(observation.reasoningSummary).toHaveLength(240);
    expect(observation.recommendedNextMove).toHaveLength(160);
    expect(observation).not.toHaveProperty("reasoning");
    expect(() => JSON.stringify(observation)).not.toThrow();
  });
});
