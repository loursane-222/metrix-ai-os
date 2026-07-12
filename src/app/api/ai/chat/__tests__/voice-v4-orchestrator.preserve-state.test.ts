import { describe, it, expect, vi } from "vitest";

// voice-v4-orchestrator.ts transitively imports conversation.repository.ts,
// which initializes a real PrismaClient at module load time and throws
// without DATABASE_URL. These tests only exercise its two pure conversation-
// state helpers, so the DB client itself is stubbed out rather than touching
// production wiring or global test config.
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

import {
  computeNextConversationState,
  preserveExecutiveStateOnTopicShift,
} from "../voice-v4-orchestrator";
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

// ─── preserveExecutiveStateOnTopicShift ───────────────────────────────────────

describe("preserveExecutiveStateOnTopicShift", () => {
  it("onceki state yoksa null doner", () => {
    expect(preserveExecutiveStateOnTopicShift(null)).toBeNull();
  });

  it("committedTitle korunur", () => {
    const result = preserveExecutiveStateOnTopicShift(makeState());
    expect(result?.committedTitle).toBe("Tahsilat sureclerini sikilastir");
  });

  it("followUpDueAt ve commitmentOutcome korunur", () => {
    const previous = makeState({ commitmentOutcome: "FAILURE" });
    const result = preserveExecutiveStateOnTopicShift(previous);
    expect(result?.followUpDueAt).toBe("2026-07-17T09:00:00.000Z");
    expect(result?.commitmentOutcome).toBe("FAILURE");
  });

  it("mindState tamamen korunur (workingMemory, hypotheses, beliefs, primaryIntent, attentionFocus)", () => {
    const previous = makeState();
    const result = preserveExecutiveStateOnTopicShift(previous);
    expect(result?.mindState).toEqual(previous.mindState);
  });

  it("diger kalici alanlar korunur (phase, lastRecommendationTitle/Rationale, lastObjectionType, objectionCount, isRevisionRequired)", () => {
    const previous = makeState();
    const result = preserveExecutiveStateOnTopicShift(previous);
    expect(result?.phase).toBe(previous.phase);
    expect(result?.lastRecommendationTitle).toBe(previous.lastRecommendationTitle);
    expect(result?.lastRecommendationRationale).toBe(previous.lastRecommendationRationale);
    expect(result?.lastObjectionType).toBe(previous.lastObjectionType);
    expect(result?.objectionCount).toBe(previous.objectionCount);
    expect(result?.isRevisionRequired).toBe(previous.isRevisionRequired);
    expect(result?.committedAt).toBe(previous.committedAt);
  });

  it("yalnizca turn-bazli clarifyingQuestion ve commitmentRequest resetlenir", () => {
    const result = preserveExecutiveStateOnTopicShift(makeState());
    expect(result?.clarifyingQuestion).toBeNull();
    expect(result?.commitmentRequest).toBeNull();
  });

  it("updatedAt yenilenir", () => {
    const previous = makeState({ updatedAt: "2020-01-01T00:00:00.000Z" });
    const result = preserveExecutiveStateOnTopicShift(previous);
    expect(result?.updatedAt).not.toBe(previous.updatedAt);
    expect(new Date(result!.updatedAt).getTime()).toBeGreaterThan(new Date(previous.updatedAt).getTime());
  });

  it("orijinal previousConversationState mutate edilmez", () => {
    const previous = makeState();
    const snapshot = JSON.parse(JSON.stringify(previous));
    preserveExecutiveStateOnTopicShift(previous);
    expect(previous).toEqual(snapshot);
  });
});

// ─── computeNextConversationState ─────────────────────────────────────────────

describe("computeNextConversationState", () => {
  it("previousConversationState yoksa 'new_topic' sonucu null kalir", () => {
    expect(computeNextConversationState("new_topic", null)).toBeNull();
  });

  it("previousConversationState yoksa 'continuity' sonucu da null kalir", () => {
    expect(computeNextConversationState("continuity", null)).toBeNull();
  });

  it("'continuity' oldugunda mevcut state korunur ve updatedAt yenilenir", () => {
    const previous = makeState({ updatedAt: "2020-01-01T00:00:00.000Z" });
    const result = computeNextConversationState("continuity", previous);
    expect(result).not.toBeNull();
    expect(result?.clarifyingQuestion).toBe(previous.clarifyingQuestion);
    expect(result?.commitmentRequest).toBe(previous.commitmentRequest);
    expect(result?.committedTitle).toBe(previous.committedTitle);
    expect(result?.mindState).toEqual(previous.mindState);
    expect(result?.updatedAt).not.toBe(previous.updatedAt);
  });

  it("'new_topic' oldugunda state artik null olmaz", () => {
    const result = computeNextConversationState("new_topic", makeState());
    expect(result).not.toBeNull();
  });

  it("'new_topic' oldugunda committedTitle korunur", () => {
    const result = computeNextConversationState("new_topic", makeState());
    expect(result?.committedTitle).toBe("Tahsilat sureclerini sikilastir");
  });

  it("'new_topic' oldugunda mindState tamamen korunur", () => {
    const previous = makeState();
    const result = computeNextConversationState("new_topic", previous);
    expect(result?.mindState).toEqual(previous.mindState);
  });

  it("'new_topic' oldugunda yalnizca clarifyingQuestion/commitmentRequest resetlenir", () => {
    const previous = makeState();
    const result = computeNextConversationState("new_topic", previous);
    expect(result?.clarifyingQuestion).toBeNull();
    expect(result?.commitmentRequest).toBeNull();
    expect(result?.phase).toBe(previous.phase);
    expect(result?.followUpDueAt).toBe(previous.followUpDueAt);
    expect(result?.commitmentOutcome).toBe(previous.commitmentOutcome);
  });

  it("orijinal previousConversationState hicbir outcome icin mutate edilmez", () => {
    const previous = makeState();
    const snapshot = JSON.parse(JSON.stringify(previous));
    computeNextConversationState("continuity", previous);
    computeNextConversationState("new_topic", previous);
    expect(previous).toEqual(snapshot);
  });
});
