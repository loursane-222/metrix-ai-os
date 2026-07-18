import { describe, it, expect } from "vitest";
import { detectConversationContinuity } from "../conversation-continuity-detector";

// FAZ 7 — Barge-in Conversation Continuity. See conversation-continuity-detector.ts
// for the elliptical-fragment rationale (shortness plus a linguistic signal).

describe("detectConversationContinuity", () => {
  it("A: short barge-in fragment after an active AI turn is not a fresh greeting", () => {
    const result = detectConversationContinuity({
      message: "Hani…",
      previousConversationState: null,
      hasPreviousAiMessage: true,
    });

    expect(result.outcome).not.toBe("new_topic");
    expect(result.outcome).toBe("ambiguous");
  });

  it("B: a short repair/correction fragment after an active AI turn is not a fresh greeting", () => {
    const result = detectConversationContinuity({
      message: "Hayır, onu demiyorum.",
      previousConversationState: null,
      hasPreviousAiMessage: true,
    });

    expect(result.outcome).toBe("ambiguous");
  });

  it("C: with no active conversation, a short greeting stays a normal new topic", () => {
    const result = detectConversationContinuity({
      message: "Merhaba.",
      previousConversationState: null,
      hasPreviousAiMessage: false,
    });

    expect(result.outcome).toBe("new_topic");
  });

  it("D: a genuinely new, self-sufficient question stays new_topic even with an active AI turn", () => {
    const result = detectConversationContinuity({
      message: "Bu arada yarın hava nasıl?",
      previousConversationState: null,
      hasPreviousAiMessage: true,
    });

    expect(result.outcome).toBe("new_topic");
  });

  it.each([
    "Saat kaç?",
    "Bugün hava nasıl?",
    "Murat kim?",
    "Tahsilat ne durumda?",
    "Teklif hazır mı?",
  ])("keeps the self-contained short question %s as new_topic", (message) => {
    expect(detectConversationContinuity({
      message,
      previousConversationState: null,
      hasPreviousAiMessage: true,
    }).outcome).toBe("new_topic");
  });

  it("still classifies a known transformation phrase as continuity (unchanged behavior)", () => {
    const result = detectConversationContinuity({
      message: "Kısaltır mısın?",
      previousConversationState: null,
      hasPreviousAiMessage: true,
    });

    expect(result.outcome).toBe("continuity");
  });

  it("other discourse fragments from the barge-in example set are not treated as new_topic", () => {
    const fragments = [
      "Yani…",
      "Şey…",
      "Az önce söylediğin…",
      "Şunu demek istedim.",
      "Peki ya diğeri?",
      "Devam et.",
      "Bir dakika.",
      "Dur, önce şunu…",
      "O değil.",
      "Nasıl yani?",
    ];

    for (const message of fragments) {
      const result = detectConversationContinuity({
        message,
        previousConversationState: null,
        hasPreviousAiMessage: true,
      });
      expect(result.outcome, `"${message}" should not resolve to new_topic`).not.toBe("new_topic");
    }
  });
});
