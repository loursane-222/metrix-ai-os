import { describe, it, expect } from "vitest";
import { extractConversationState } from "../chat-shared";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeMetadata(conversationState: Record<string, unknown>): unknown {
  return { conversationState };
}

function makeBaseState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    ...overrides,
  };
}

// ─── mindState round-trip ─────────────────────────────────────────────────────

describe("extractConversationState — mindState geri yukleme", () => {
  it("gecerli mindState metadata icinden aynen okunur", () => {
    const metadata = makeMetadata(
      makeBaseState({
        mindState: {
          attentionFocus: "UNCERTAINTY",
          workingMemory: [{ key: "phase", value: "OPEN_ENDED" }],
          hypotheses: [{ id: "h1", summary: "Test hipotez" }],
          beliefs: [{ id: "b1", summary: "Test kanaat" }],
        },
      }),
    );

    const result = extractConversationState(metadata);

    expect(result?.mindState).toEqual({
      attentionFocus: "UNCERTAINTY",
      workingMemory: [{ key: "phase", value: "OPEN_ENDED" }],
      hypotheses: [{ id: "h1", summary: "Test hipotez" }],
      beliefs: [{ id: "b1", summary: "Test kanaat" }],
      primaryIntent: null,
      intentConfidence: null,
    });
  });

  it("attentionFocus alani korunur", () => {
    const metadata = makeMetadata(makeBaseState({ mindState: { attentionFocus: "RECOMMENDATION" } }));
    const result = extractConversationState(metadata);
    expect(result?.mindState?.attentionFocus).toBe("RECOMMENDATION");
  });

  it("workingMemory alani korunur", () => {
    const metadata = makeMetadata(
      makeBaseState({
        mindState: { workingMemory: [{ key: "lastRecommendationTitle", value: "Plan A" }] },
      }),
    );
    const result = extractConversationState(metadata);
    expect(result?.mindState?.workingMemory).toEqual([
      { key: "lastRecommendationTitle", value: "Plan A" },
    ]);
  });

  it("hypotheses alani korunur", () => {
    const metadata = makeMetadata(
      makeBaseState({ mindState: { hypotheses: [{ id: "h1", summary: "Hipotez" }] } }),
    );
    const result = extractConversationState(metadata);
    expect(result?.mindState?.hypotheses).toEqual([{ id: "h1", summary: "Hipotez" }]);
  });

  it("beliefs alani korunur", () => {
    const metadata = makeMetadata(
      makeBaseState({ mindState: { beliefs: [{ id: "b1", summary: "Kanaat" }] } }),
    );
    const result = extractConversationState(metadata);
    expect(result?.mindState?.beliefs).toEqual([{ id: "b1", summary: "Kanaat" }]);
  });

  it("mindState eksikse (undefined) conversationState yine parse edilir, mindState null doner", () => {
    const metadata = makeMetadata(makeBaseState());
    const result = extractConversationState(metadata);
    expect(result).not.toBeNull();
    expect(result?.phase).toBe("OPEN_ENDED");
    expect(result?.mindState).toBeNull();
  });

  it("mindState nesne degilse (gecersiz tip) throw etmeden null doner", () => {
    const metadata = makeMetadata(makeBaseState({ mindState: "invalid-string-value" }));
    expect(() => extractConversationState(metadata)).not.toThrow();
    const result = extractConversationState(metadata);
    expect(result?.mindState).toBeNull();
  });

  it("workingMemory icindeki bozuk kayitlar filtrelenir, gecerli kayitlar korunur", () => {
    const metadata = makeMetadata(
      makeBaseState({
        mindState: {
          workingMemory: [
            { key: "phase", value: "OPEN_ENDED" },
            { key: 123, value: "bozuk-key" },
            { value: "key-eksik" },
          ],
        },
      }),
    );
    const result = extractConversationState(metadata);
    expect(result?.mindState?.workingMemory).toEqual([{ key: "phase", value: "OPEN_ENDED" }]);
  });

  it("hypotheses icinde id veya summary eksik kayitlar filtrelenir", () => {
    const metadata = makeMetadata(
      makeBaseState({
        mindState: {
          hypotheses: [
            { id: "h1", summary: "Gecerli hipotez" },
            { id: "h2" },
            { summary: "id eksik" },
          ],
        },
      }),
    );
    const result = extractConversationState(metadata);
    expect(result?.mindState?.hypotheses).toEqual([{ id: "h1", summary: "Gecerli hipotez" }]);
  });

  it("hypotheses icinde gecerli lastReinforcedAt alani korunur", () => {
    const metadata = makeMetadata(
      makeBaseState({
        mindState: {
          hypotheses: [{ id: "h1", summary: "Hipotez", lastReinforcedAt: "2026-07-11T00:00:00.000Z" }],
        },
      }),
    );
    const result = extractConversationState(metadata);
    expect(result?.mindState?.hypotheses).toEqual([
      { id: "h1", summary: "Hipotez", lastReinforcedAt: "2026-07-11T00:00:00.000Z" },
    ]);
  });

  it("hypotheses icinde lastReinforcedAt eksikse (eski kayit) throw etmeden alan olmadan doner", () => {
    const metadata = makeMetadata(
      makeBaseState({ mindState: { hypotheses: [{ id: "h1", summary: "Eski kayit" }] } }),
    );
    expect(() => extractConversationState(metadata)).not.toThrow();
    const result = extractConversationState(metadata);
    expect(result?.mindState?.hypotheses).toEqual([{ id: "h1", summary: "Eski kayit" }]);
  });

  it("lastReinforcedAt gecersiz tipteyse (string degil) sessizce yok sayilir", () => {
    const metadata = makeMetadata(
      makeBaseState({
        mindState: {
          hypotheses: [{ id: "h1", summary: "Bozuk damga", lastReinforcedAt: 12345 }],
        },
      }),
    );
    const result = extractConversationState(metadata);
    expect(result?.mindState?.hypotheses).toEqual([{ id: "h1", summary: "Bozuk damga" }]);
  });

  it("beliefs icinde gecerli lastReinforcedAt alani korunur", () => {
    const metadata = makeMetadata(
      makeBaseState({
        mindState: {
          beliefs: [{ id: "b1", summary: "Kanaat", lastReinforcedAt: "2026-07-11T00:00:00.000Z" }],
        },
      }),
    );
    const result = extractConversationState(metadata);
    expect(result?.mindState?.beliefs).toEqual([
      { id: "b1", summary: "Kanaat", lastReinforcedAt: "2026-07-11T00:00:00.000Z" },
    ]);
  });

  it("beliefs icinde id veya summary eksik kayitlar filtrelenir", () => {
    const metadata = makeMetadata(
      makeBaseState({
        mindState: {
          beliefs: [
            { id: "b1", summary: "Gecerli kanaat" },
            { id: "b2" },
          ],
        },
      }),
    );
    const result = extractConversationState(metadata);
    expect(result?.mindState?.beliefs).toEqual([{ id: "b1", summary: "Gecerli kanaat" }]);
  });

  it("metadata gecersizse (obje degil) tum fonksiyon guvenli sekilde null doner", () => {
    expect(extractConversationState(null)).toBeNull();
    expect(extractConversationState("not-an-object")).toBeNull();
    expect(extractConversationState(undefined)).toBeNull();
  });

  it("conversationState.phase eksikse tum state (mindState dahil) null doner", () => {
    const metadata = makeMetadata({ mindState: { attentionFocus: "X" } });
    expect(extractConversationState(metadata)).toBeNull();
  });

  it("primaryIntent ve intentConfidence gecerliyse aynen okunur", () => {
    const metadata = makeMetadata(
      makeBaseState({
        mindState: {
          primaryIntent: "Kuzey Ege'de distributor agi kur",
          intentConfidence: "GÜÇLÜ",
        },
      }),
    );
    const result = extractConversationState(metadata);
    expect(result?.mindState?.primaryIntent).toBe("Kuzey Ege'de distributor agi kur");
    expect(result?.mindState?.intentConfidence).toBe("GÜÇLÜ");
  });

  it("primaryIntent eksikse (eski kayit) throw etmeden null doner", () => {
    const metadata = makeMetadata(makeBaseState({ mindState: { attentionFocus: "X" } }));
    expect(() => extractConversationState(metadata)).not.toThrow();
    const result = extractConversationState(metadata);
    expect(result?.mindState?.primaryIntent).toBeNull();
    expect(result?.mindState?.intentConfidence).toBeNull();
  });

  it("intentConfidence gecersiz bir deger tasiyorsa (bilinmeyen etiket) null'a duser", () => {
    const metadata = makeMetadata(
      makeBaseState({
        mindState: { primaryIntent: "Test amac", intentConfidence: "BILINMEYEN" },
      }),
    );
    const result = extractConversationState(metadata);
    expect(result?.mindState?.primaryIntent).toBe("Test amac");
    expect(result?.mindState?.intentConfidence).toBeNull();
  });
});
