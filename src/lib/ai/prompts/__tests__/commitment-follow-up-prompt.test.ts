import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildBaseMetrixPrompt } from "../prompt-format";
import type { BuildSystemPromptInput } from "../prompt.types";
import type { ExecutiveConversationState } from "@/lib/ai/executive-conversation.types";
import type { MemoryContext } from "@/lib/memory/memory-context.types";

// Executive Time — Faz 2. A followUpDueAt commitment must stay visible even
// after the conversation phase moves away from COMMITTED to another topic.

// ─── Fixtures ────────────────────────────────────────────────────────────────

const NOW = "2026-07-12T00:00:00.000Z";
const PAST_DUE = "2026-07-11T00:00:00.000Z";
const FUTURE_DUE = "2026-07-13T00:00:00.000Z";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

function makeEmptyMemoryContext(): MemoryContext {
  return {
    version: "v1",
    generatedAt: NOW,
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
    updatedAt: NOW,
    mindState: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildBaseMetrixPrompt — faz disinda gecmis takip taahhudu", () => {
  it("phase COMMITTED disindayken vadesi gecmis takip hala prompt'a girer", () => {
    const input: BuildSystemPromptInput = {
      ...makeMinimalPromptInput(),
      conversationState: makeConversationState({
        phase: "CLARIFYING",
        committedTitle: "Nakit tahsilati",
        followUpDueAt: PAST_DUE,
        commitmentOutcome: null,
      }),
    };
    const prompt = buildBaseMetrixPrompt(input);
    expect(prompt).toContain(
      '- Konu degisti ama "Nakit tahsilati" taahhudunun takip zamani gecti; sonucunu unutma, uygun ani bulup sor.',
    );
  });

  it("phase COMMITTED iken mevcut satir kullanilir, yeni satir tekrar eklenmez", () => {
    const input: BuildSystemPromptInput = {
      ...makeMinimalPromptInput(),
      conversationState: makeConversationState({
        phase: "COMMITTED",
        committedTitle: "Nakit tahsilati",
        followUpDueAt: PAST_DUE,
        commitmentOutcome: null,
      }),
    };
    const prompt = buildBaseMetrixPrompt(input);
    expect(prompt).toContain('- "Nakit tahsilati" icin takip zamani geldi. Kullaniciya sonucu sor.');
    expect(prompt).not.toContain("Konu degisti ama");
  });

  it("takip tarihi henuz gelmediyse (gelecekte) satir eklenmez", () => {
    const input: BuildSystemPromptInput = {
      ...makeMinimalPromptInput(),
      conversationState: makeConversationState({
        phase: "CLARIFYING",
        committedTitle: "Nakit tahsilati",
        followUpDueAt: FUTURE_DUE,
        commitmentOutcome: null,
      }),
    };
    const prompt = buildBaseMetrixPrompt(input);
    expect(prompt).not.toContain("takip zamani gecti");
  });

  it("commitmentOutcome zaten belliyse (SUCCESS) satir eklenmez", () => {
    const input: BuildSystemPromptInput = {
      ...makeMinimalPromptInput(),
      conversationState: makeConversationState({
        phase: "CLARIFYING",
        committedTitle: "Nakit tahsilati",
        followUpDueAt: PAST_DUE,
        commitmentOutcome: "SUCCESS",
      }),
    };
    const prompt = buildBaseMetrixPrompt(input);
    expect(prompt).not.toContain("takip zamani gecti");
  });

  it("followUpDueAt yoksa (null) satir eklenmez", () => {
    const input: BuildSystemPromptInput = {
      ...makeMinimalPromptInput(),
      conversationState: makeConversationState({
        phase: "CLARIFYING",
        committedTitle: "Nakit tahsilati",
        followUpDueAt: null,
        commitmentOutcome: null,
      }),
    };
    const prompt = buildBaseMetrixPrompt(input);
    expect(prompt).not.toContain("takip zamani gecti");
  });
});
