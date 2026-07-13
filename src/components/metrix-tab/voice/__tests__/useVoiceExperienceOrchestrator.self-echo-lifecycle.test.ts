import { describe, it, expect } from "vitest";
import {
  classifyBargeInTranscript,
  resolveNativeSpokenReference,
  shouldDiscardFinalTranscript,
} from "../useVoiceExperienceOrchestrator";

// Self-echo lifecycle fix — Native Voice Runtime. Root cause: interrupt()
// used to clear nativeAssistantTranscriptRef immediately, so the same
// interrupted utterance's own late-arriving final transcript had nothing
// left to compare against, was misclassified as genuine new speech, and
// fell through to beginTurn()/send() — "Metrix düşünüyor" reappeared
// mid-response, plus a spurious/short user message. These tests exercise
// the two pure functions the fix is built on (resolveNativeSpokenReference,
// shouldDiscardFinalTranscript) composed exactly the way
// currentSpokenReference/handleFinalTranscript use them in production, per
// each invariant in the fix.

const spoken = "Bugün en önemli konu tahsilat sürecini hızlandırmak.";

describe("resolveNativeSpokenReference", () => {
  it("prefers the live native transcript while a response is in flight", () => {
    expect(
      resolveNativeSpokenReference({
        nativeAssistantTranscript: spoken,
        pendingInterruptedTranscript: "stale leftover text",
        revealedText: "",
      }),
    ).toBe(spoken);
  });

  it("falls back to the preserved interrupted-response snapshot once the live transcript is cleared", () => {
    // Mirrors interrupt()'s resetTurnState() clearing nativeAssistantTranscriptRef
    // to "" while pendingInterruptedTranscriptRef still holds the pre-clear snapshot.
    expect(
      resolveNativeSpokenReference({
        nativeAssistantTranscript: "",
        pendingInterruptedTranscript: spoken,
        revealedText: "",
      }),
    ).toBe(spoken);
  });

  it("returns empty when neither the live nor the preserved reference has anything", () => {
    expect(
      resolveNativeSpokenReference({
        nativeAssistantTranscript: "",
        pendingInterruptedTranscript: "",
        revealedText: "",
      }),
    ).toBe("");
  });

  it("appends the displayed prefix as an explicit audible-so-far signal", () => {
    expect(
      resolveNativeSpokenReference({
        nativeAssistantTranscript: "",
        pendingInterruptedTranscript: "Bugün en",
        revealedText: "Bugün",
      }),
    ).toBe("Bugün en Bugün");
  });
});

describe("shouldDiscardFinalTranscript", () => {
  // 1 & 2 & 3 — a delayed assistant echo final transcript, arriving after
  // interrupt() already reset bargeInPendingRef (wasPending=false), must
  // still be discarded: no beginTurn() ("Metrix düşünüyor" must not
  // reappear), no send(), no user message.
  it("discards a delayed self-echo transcript even after wasPending was already reset by interrupt()", () => {
    const decision = classifyBargeInTranscript({
      candidate: "önemli konu tahsilat",
      spokenReference: spoken, // resolved via pendingInterruptedTranscriptRef fallback
      nativeAssistantActive: false, // wasPending is false at this point, exactly as production computes it
      isFinal: true,
    });
    expect(decision).toBe("self_echo");
    expect(
      shouldDiscardFinalTranscript({ wasPending: false, wasRecentlyInterrupted: true, decision }),
    ).toBe(true);
  });

  // 4 — genuine user barge-in must remain processed immediately and
  // unaffected by this gate, both while still pending and after resolving.
  it("never discards a genuine, clearly diverging user utterance", () => {
    const decision = classifyBargeInTranscript({
      candidate: "Bunun yerine satış planını konuşalım",
      spokenReference: spoken,
      nativeAssistantActive: true,
      isFinal: true,
    });
    expect(decision).toBe("user_speech");
    expect(
      shouldDiscardFinalTranscript({ wasPending: true, wasRecentlyInterrupted: false, decision }),
    ).toBe(false);
    expect(
      shouldDiscardFinalTranscript({ wasPending: false, wasRecentlyInterrupted: true, decision }),
    ).toBe(false);
  });

  // 5 — a handful of overlapping words is not enough to suppress a real
  // question; only strong/whole echo evidence (the existing
  // isLikelySelfEcho threshold, unchanged) does.
  it("only suppresses on strong echo evidence, not incidental word overlap", () => {
    const weakOverlap = classifyBargeInTranscript({
      candidate: "tahsilat konusunda başka bir şey sormak istiyorum aslında",
      spokenReference: spoken,
      nativeAssistantActive: false,
      isFinal: true,
    });
    expect(weakOverlap).toBe("user_speech");
    expect(
      shouldDiscardFinalTranscript({
        wasPending: false,
        wasRecentlyInterrupted: true,
        decision: weakOverlap,
      }),
    ).toBe(false);

    const strongOverlap = classifyBargeInTranscript({
      candidate: "en önemli konu tahsilat sürecini",
      spokenReference: spoken,
      nativeAssistantActive: false,
      isFinal: true,
    });
    expect(strongOverlap).toBe("self_echo");
    expect(
      shouldDiscardFinalTranscript({
        wasPending: false,
        wasRecentlyInterrupted: true,
        decision: strongOverlap,
      }),
    ).toBe(true);
  });

  // 6 — the reference is one-shot (production clears
  // pendingInterruptedTranscriptRef immediately after this evaluation, and
  // again on the next native response's "started" phase / stop()), so a
  // later, unrelated genuine utterance is never suppressed by stale content.
  it("does not suppress a later genuine turn once the interrupted-response reference has been consumed", () => {
    // First evaluation: the delayed echo, correctly discarded.
    const echoDecision = classifyBargeInTranscript({
      candidate: "en önemli konu tahsilat sürecini",
      spokenReference: spoken,
      nativeAssistantActive: false,
      isFinal: true,
    });
    expect(
      shouldDiscardFinalTranscript({
        wasPending: false,
        wasRecentlyInterrupted: true,
        decision: echoDecision,
      }),
    ).toBe(true);

    // Production clears pendingInterruptedTranscriptRef right after that
    // evaluation (one-shot) — simulated here by wasRecentlyInterrupted:false
    // and an empty reference for the next, separate utterance.
    const nextDecision = classifyBargeInTranscript({
      candidate: "yarınki toplantıyı bir saat erteleyebilir miyiz",
      spokenReference: resolveNativeSpokenReference({
        nativeAssistantTranscript: "",
        pendingInterruptedTranscript: "",
        revealedText: "",
      }),
      nativeAssistantActive: false,
      isFinal: true,
    });
    expect(nextDecision).toBe("user_speech");
    expect(
      shouldDiscardFinalTranscript({
        wasPending: false,
        wasRecentlyInterrupted: false,
        decision: nextDecision,
      }),
    ).toBe(false);
  });
});
