import { describe, it, expect } from "vitest";
import { buildBaseMetrixPrompt } from "../prompt-format";
import type { BuildSystemPromptInput } from "../prompt.types";
import type { ExecutiveConversationState } from "@/lib/ai/executive-conversation.types";
import type { MemoryContext } from "@/lib/memory/memory-context.types";

// Executive Intent Persistence — Faz 2. primaryIntent must reach the LLM
// alongside (not instead of) the existing per-turn attentionFocus.

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeEmptyMemoryContext(): MemoryContext {
  return {
    version: "v1",
    generatedAt: "2026-07-12T00:00:00.000Z",
    organizationId: "test-org",
    totalIncluded: 0,
    highlights: [],
    strategic: [],
    facts: [],
    processes: [],
    preferences: [],
    conflicts: [],
  };
}

function makeMinimalPromptInput(): BuildSystemPromptInput {
  return {
    memoryContext: makeEmptyMemoryContext(),
    organizationSummary: "Test sirket.",
    personContext: [],
  };
}

function makeConversationState(
  overrides: Partial<ExecutiveConversationState> = {},
): ExecutiveConversationState {
  return {
    phase: "OPEN_ENDED",
    lastRecommendationTitle: null,
    lastRecommendationRationale: null,
    lastObjectionType: null,
    objectionCount: 0,
    clarifyingQuestion: null,
    commitmentRequest: null,
    isRevisionRequired: false,
    committedTitle: null,
    committedAt: null,
    followUpDueAt: null,
    commitmentOutcome: null,
    updatedAt: "2026-07-12T00:00:00.000Z",
    mindState: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildBaseMetrixPrompt — primaryIntent prompt injection", () => {
  it("primaryIntent prompt'a 'Ana yonetim amaci' direktifiyle girer", () => {
    const input: BuildSystemPromptInput = {
      ...makeMinimalPromptInput(),
      conversationState: makeConversationState({
        mindState: {
          attentionFocus: null,
          workingMemory: [],
          hypotheses: [],
          beliefs: [],
          primaryIntent: "Kuzey Ege'de distributor agi kur",
          intentConfidence: "GÜÇLÜ",
        },
      }),
    };
    const prompt = buildBaseMetrixPrompt(input);
    expect(prompt).toContain(
      "- Ana yonetim amaci: Kuzey Ege'de distributor agi kur. Konu sapsa bile bu amaca geri donebilmen icin hatirinda tut.",
    );
  });

  it("primaryIntent ve attentionFocus ayni prompt'ta birlikte yer alir", () => {
    const input: BuildSystemPromptInput = {
      ...makeMinimalPromptInput(),
      conversationState: makeConversationState({
        mindState: {
          attentionFocus: "BUDGET_CONSTRAINT",
          workingMemory: [],
          hypotheses: [],
          beliefs: [],
          primaryIntent: "Kuzey Ege'de distributor agi kur",
          intentConfidence: "GÜÇLÜ",
        },
      }),
    };
    const prompt = buildBaseMetrixPrompt(input);
    expect(prompt).toContain("- Ana yonetim amaci: Kuzey Ege'de distributor agi kur");
    expect(prompt).toContain("- Guncel odak: BUDGET_CONSTRAINT. Bu odaktan sapma.");
  });

  it("primaryIntent yoksa (null) satir eklenmez", () => {
    const input: BuildSystemPromptInput = {
      ...makeMinimalPromptInput(),
      conversationState: makeConversationState({
        mindState: { attentionFocus: null, workingMemory: [], hypotheses: [], beliefs: [], primaryIntent: null },
      }),
    };
    const prompt = buildBaseMetrixPrompt(input);
    expect(prompt).not.toContain("Ana yonetim amaci");
  });
});
