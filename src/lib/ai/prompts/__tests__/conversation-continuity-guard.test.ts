import { describe, it, expect } from "vitest";
import { buildBaseMetrixPrompt } from "../prompt-format";
import type { BuildSystemPromptInput } from "../prompt.types";
import type { MemoryContext } from "@/lib/memory/memory-context.types";
import type { ExecutiveConversationState } from "@/lib/ai/executive-conversation.types";

// Freeze Day — Production Blocker: mid-conversation reset greeting.
//
// Root cause: a turn served earlier by the Voice V4 fast path
// (voice-v4-orchestrator.ts) never computes a real conversationState phase
// — its carried-forward state stays null/INITIAL by construction. When such
// a conversation later falls into the blocking pipeline (ambiguous
// continuity: semantic repair, elliptical fragment, etc.), formatConversationState
// used to go completely silent for phase === "INITIAL" / null state,
// leaving the model with no signal that a conversation was already
// underway — the proven mechanism behind the mid-conversation "Merhaba,
// size nasıl yardımcı olabilirim?" reset. See prompt-format.ts's
// formatConversationState for the fix (hasPriorTurn parameter, sourced from
// conversationPresence.recentTurnCount).

function makeEmptyMemoryContext(): MemoryContext {
  return {
    version: "v1",
    generatedAt: "2026-07-02T00:00:00.000Z",
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

function makeMinimalPromptInput(
  overrides: Partial<BuildSystemPromptInput> = {},
): BuildSystemPromptInput {
  return {
    memoryContext: makeEmptyMemoryContext(),
    organizationSummary: "Test sirket.",
    personContext: [],
    ...overrides,
  };
}

const GREETING_BAN_MARKER = "nasil yardimci olabilirim";
const CONTINUITY_HEADER = "Konusma surekliligi:";

function makeNonInitialState(): ExecutiveConversationState {
  return {
    phase: "RECOMMENDATION_GIVEN",
    lastRecommendationTitle: "Tahsilat surecini hizlandir",
    lastRecommendationRationale: "Nakit akisi geriliyor",
    lastObjectionType: null,
    objectionCount: 0,
    clarifyingQuestion: null,
    commitmentRequest: "Bunu bu hafta uygulayacak misin?",
    isRevisionRequired: false,
    committedTitle: null,
    committedAt: null,
    followUpDueAt: null,
    commitmentOutcome: null,
    updatedAt: "2026-07-13T00:00:00.000Z",
  };
}

describe("buildBaseMetrixPrompt — mid-conversation continuity guard", () => {
  it("1: true first turn (no prior turn, no state) — no continuity section, no greeting ban", () => {
    const prompt = buildBaseMetrixPrompt(
      makeMinimalPromptInput({
        conversationState: null,
        conversationPresence: { recentTurnCount: 0 },
      }),
    );
    expect(prompt).not.toContain(CONTINUITY_HEADER);
    expect(prompt).not.toContain(GREETING_BAN_MARKER);
  });

  it("2/3: prior turn exists but state is null/INITIAL (fast-path-originated) — guard fires", () => {
    const prompt = buildBaseMetrixPrompt(
      makeMinimalPromptInput({
        conversationState: null,
        conversationPresence: { recentTurnCount: 1 },
      }),
    );
    expect(prompt).toContain(CONTINUITY_HEADER);
    expect(prompt).toContain(GREETING_BAN_MARKER);
    expect(prompt).toContain("sohbet zaten devam ediyor");
  });

  it("prior turn exists, state phase is explicitly INITIAL — guard fires the same way", () => {
    const prompt = buildBaseMetrixPrompt(
      makeMinimalPromptInput({
        conversationState: {
          ...makeNonInitialState(),
          phase: "INITIAL",
          lastRecommendationTitle: null,
          lastRecommendationRationale: null,
          commitmentRequest: null,
        },
        conversationPresence: { recentTurnCount: 1 },
      }),
    );
    expect(prompt).toContain(CONTINUITY_HEADER);
    expect(prompt).toContain(GREETING_BAN_MARKER);
  });

  it("a real, non-INITIAL conversationState still renders its existing structured continuity section unchanged", () => {
    const prompt = buildBaseMetrixPrompt(
      makeMinimalPromptInput({
        conversationState: makeNonInitialState(),
        conversationPresence: { recentTurnCount: 1 },
      }),
    );
    expect(prompt).toContain(CONTINUITY_HEADER);
    expect(prompt).toContain("Tahsilat surecini hizlandir");
    // The generic greeting-ban guard is specific to the missing-state path —
    // a real state already carries enough continuity signal on its own.
    expect(prompt).not.toContain(GREETING_BAN_MARKER);
  });

  it("no conversationPresence at all behaves like recentTurnCount 0 (backward compatible default)", () => {
    const prompt = buildBaseMetrixPrompt(
      makeMinimalPromptInput({ conversationState: null }),
    );
    expect(prompt).not.toContain(CONTINUITY_HEADER);
  });
});
