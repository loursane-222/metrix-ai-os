import { describe, it, expect } from "vitest";
import { preserveDurableStateOnGapIntercept } from "../chat-shared";
import type { ExecutiveConversationState } from "@/lib/ai/executive-conversation.types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<ExecutiveConversationState> = {}): ExecutiveConversationState {
  return {
    phase: "CLARIFYING",
    lastRecommendationTitle: "Nakit akisi raporunu haftalik hale getir",
    lastRecommendationRationale: "Gecikme trendini erken yakalamak icin",
    lastObjectionType: "BUDGET_CONSTRAINT",
    objectionCount: 2,
    clarifyingQuestion: "Hangi hesap donemini kastediyorsun?",
    commitmentRequest: "Bunu bu hafta uygulayalim mi?",
    isRevisionRequired: true,
    committedTitle: "Tahsilat sureclerini sikilastir",
    committedAt: "2026-07-10T09:00:00.000Z",
    followUpDueAt: "2026-07-17T09:00:00.000Z",
    commitmentOutcome: null,
    updatedAt: "2026-07-10T09:00:00.000Z",
    mindState: {
      attentionFocus: "CASH_FLOW_RISK",
      workingMemory: [{ key: "phase", value: "CLARIFYING" }],
      hypotheses: [{ id: "h1", summary: "Musteri X odemeyi geciktiriyor" }],
      beliefs: [{ id: "commitment-tahsilat", summary: "Taahhut riskli" }],
      primaryIntent: "Nakit akisini iyilestir",
      intentConfidence: "ORTA",
    },
    ...overrides,
  };
}

describe("preserveDurableStateOnGapIntercept", () => {
  it("previousConversationState yoksa null doner", () => {
    expect(preserveDurableStateOnGapIntercept(null)).toBeNull();
  });

  it("previousConversationState varsa durable state korunur (null olmaz)", () => {
    const result = preserveDurableStateOnGapIntercept(makeState());
    expect(result).not.toBeNull();
  });

  it("committedTitle korunur", () => {
    const result = preserveDurableStateOnGapIntercept(makeState());
    expect(result?.committedTitle).toBe("Tahsilat sureclerini sikilastir");
  });

  it("followUpDueAt korunur", () => {
    const result = preserveDurableStateOnGapIntercept(makeState());
    expect(result?.followUpDueAt).toBe("2026-07-17T09:00:00.000Z");
  });

  it("commitmentOutcome korunur", () => {
    const previous = makeState({ commitmentOutcome: "FAILURE" });
    const result = preserveDurableStateOnGapIntercept(previous);
    expect(result?.commitmentOutcome).toBe("FAILURE");
  });

  it("mindState tamamen korunur (workingMemory, hypotheses, beliefs, primaryIntent, attentionFocus)", () => {
    const previous = makeState();
    const result = preserveDurableStateOnGapIntercept(previous);
    expect(result?.mindState).toEqual(previous.mindState);
  });

  it("diger durable alanlar korunur (phase, lastRecommendationTitle/Rationale, lastObjectionType, objectionCount, isRevisionRequired, committedAt)", () => {
    const previous = makeState();
    const result = preserveDurableStateOnGapIntercept(previous);
    expect(result?.phase).toBe(previous.phase);
    expect(result?.lastRecommendationTitle).toBe(previous.lastRecommendationTitle);
    expect(result?.lastRecommendationRationale).toBe(previous.lastRecommendationRationale);
    expect(result?.lastObjectionType).toBe(previous.lastObjectionType);
    expect(result?.objectionCount).toBe(previous.objectionCount);
    expect(result?.isRevisionRequired).toBe(previous.isRevisionRequired);
    expect(result?.committedAt).toBe(previous.committedAt);
  });

  it("clarifyingQuestion resetlenir", () => {
    const result = preserveDurableStateOnGapIntercept(makeState());
    expect(result?.clarifyingQuestion).toBeNull();
  });

  it("commitmentRequest resetlenir", () => {
    const result = preserveDurableStateOnGapIntercept(makeState());
    expect(result?.commitmentRequest).toBeNull();
  });

  it("updatedAt yenilenir", () => {
    const previous = makeState({ updatedAt: "2020-01-01T00:00:00.000Z" });
    const result = preserveDurableStateOnGapIntercept(previous);
    expect(result?.updatedAt).not.toBe(previous.updatedAt);
    expect(new Date(result!.updatedAt).getTime()).toBeGreaterThan(new Date(previous.updatedAt).getTime());
  });

  it("orijinal previousConversationState mutate edilmez", () => {
    const previous = makeState();
    const snapshot = JSON.parse(JSON.stringify(previous));
    preserveDurableStateOnGapIntercept(previous);
    expect(previous).toEqual(snapshot);
  });
});
