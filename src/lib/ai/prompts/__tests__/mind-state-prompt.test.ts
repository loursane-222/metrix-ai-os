import { describe, it, expect } from "vitest";
import { buildBaseMetrixPrompt } from "../prompt-format";
import type { BuildSystemPromptInput } from "../prompt.types";
import type { ExecutiveConversationState } from "@/lib/ai/executive-conversation.types";
import type { MemoryContext } from "@/lib/memory/memory-context.types";

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

// ─── mindState prompt injection ───────────────────────────────────────────────

describe("buildBaseMetrixPrompt — mindState prompt injection", () => {
  it("attentionFocus prompt'a 'Bu odaktan sapma' direktifiyle girer", () => {
    const input: BuildSystemPromptInput = {
      ...makeMinimalPromptInput(),
      conversationState: makeConversationState({
        mindState: { attentionFocus: "UNCERTAINTY", workingMemory: [], hypotheses: [], beliefs: [] },
      }),
    };
    const prompt = buildBaseMetrixPrompt(input);
    expect(prompt).toContain("- Guncel odak: UNCERTAINTY. Bu odaktan sapma.");
  });

  it("workingMemory prompt'a girer", () => {
    const input: BuildSystemPromptInput = {
      ...makeMinimalPromptInput(),
      conversationState: makeConversationState({
        mindState: {
          attentionFocus: null,
          workingMemory: [
            { key: "phase", value: "OPEN_ENDED" },
            { key: "lastRecommendationTitle", value: "Plan A" },
          ],
          hypotheses: [],
          beliefs: [],
        },
      }),
    };
    const prompt = buildBaseMetrixPrompt(input);
    expect(prompt).toContain("- Aktif calisma baglami: phase: OPEN_ENDED; lastRecommendationTitle: Plan A");
  });

  it("hypotheses prompt'a girer", () => {
    const input: BuildSystemPromptInput = {
      ...makeMinimalPromptInput(),
      conversationState: makeConversationState({
        mindState: {
          attentionFocus: null,
          workingMemory: [],
          hypotheses: [{ id: "h1", summary: "Benzersiz-hipotez-XYZ" }],
          beliefs: [],
        },
      }),
    };
    const prompt = buildBaseMetrixPrompt(input);
    expect(prompt).toContain("- Aktif hipotezler (henuz dogrulanmadi): Benzersiz-hipotez-XYZ");
  });

  it("beliefs prompt'a girer", () => {
    const input: BuildSystemPromptInput = {
      ...makeMinimalPromptInput(),
      conversationState: makeConversationState({
        mindState: {
          attentionFocus: null,
          workingMemory: [],
          hypotheses: [],
          beliefs: [{ id: "b1", summary: "Benzersiz-kanaat-XYZ" }],
        },
      }),
    };
    const prompt = buildBaseMetrixPrompt(input);
    expect(prompt).toContain("- Mevcut kanaatler: Benzersiz-kanaat-XYZ");
  });

  it("mindState null ise hicbir mindState blogu prompt'a eklenmez", () => {
    const input: BuildSystemPromptInput = {
      ...makeMinimalPromptInput(),
      conversationState: makeConversationState({ mindState: null }),
    };
    const prompt = buildBaseMetrixPrompt(input);
    expect(prompt).not.toContain("Guncel odak:");
    expect(prompt).not.toContain("Aktif calisma baglami:");
    expect(prompt).not.toContain("Aktif hipotezler");
    expect(prompt).not.toContain("Mevcut kanaatler:");
  });

  it("mindState alanlari bos dizi/null ise ilgili bloklar gorunmez", () => {
    const input: BuildSystemPromptInput = {
      ...makeMinimalPromptInput(),
      conversationState: makeConversationState({
        mindState: { attentionFocus: null, workingMemory: [], hypotheses: [], beliefs: [] },
      }),
    };
    const prompt = buildBaseMetrixPrompt(input);
    expect(prompt).not.toContain("Guncel odak:");
    expect(prompt).not.toContain("Aktif calisma baglami:");
    expect(prompt).not.toContain("Aktif hipotezler");
    expect(prompt).not.toContain("Mevcut kanaatler:");
  });

  it("conversationState hic verilmemisse mindState blogu prompt'a girmez", () => {
    const prompt = buildBaseMetrixPrompt(makeMinimalPromptInput());
    expect(prompt).not.toContain("Guncel odak:");
  });
});
