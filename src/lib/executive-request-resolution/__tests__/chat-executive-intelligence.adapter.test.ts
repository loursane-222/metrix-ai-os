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
