import { readFileSync } from "node:fs";

import { afterEach, describe, it, expect, vi } from "vitest";
import {
  advanceNativeReveal,
  classifyBargeInTranscript,
  clearNativeRevealTimer,
  decideNativeFinalization,
  isLikelySelfEcho,
  shouldInterruptOnSpeechStarted,
} from "../useVoiceExperienceOrchestrator";

afterEach(() => {
  vi.useRealTimers();
});

// Final Fix — Native Voice Runtime transcript pacing. Root cause: the
// Realtime API's response.output_audio_transcript.delta stream generates
// far faster than the corresponding spoken audio, so directly mirroring
// every delta into revealedText (the previous behavior) made the whole
// response appear almost instantly while audio kept playing. Production now
// gates this word-boundary reveal between output_audio_buffer.started/stopped.

describe("advanceNativeReveal", () => {
  it("reveals progressively at whole-word boundaries", () => {
    const target = "Bugün en önemli";
    expect(advanceNativeReveal("", target, 1)).toBe("Bugün");
    expect(advanceNativeReveal("Bugün", target, 1)).toBe("Bugün en");
    expect(advanceNativeReveal("Bugün en", target, 1)).toBe(target);
  });

  it("eventually reaches the full target after enough ticks, without exceeding it", () => {
    const target = "Bugün en önemli";
    let shown = "";
    for (let i = 0; i < 20; i++) {
      shown = advanceNativeReveal(shown, target, 1);
    }
    expect(shown).toBe(target);
  });

  it("target growing between ticks (more deltas arrived) is picked up on the next tick", () => {
    let target = "Bugün";
    let shown = advanceNativeReveal("", target, 1);
    expect(shown).toBe("Bugün");

    // More deltas arrive, growing the target — next tick should continue
    // revealing from where it left off, not restart or skip.
    target = "Bugün en önemli";
    shown = advanceNativeReveal(shown, target, 1);
    expect(shown).toBe("Bugün en");
    expect(target.startsWith(shown)).toBe(true);
  });

  it("is a no-op once shown has caught up to target", () => {
    const target = "Tamam.";
    expect(advanceNativeReveal(target, target, 5)).toBe(target);
  });

  it("never reveals past the target's current length even with a large step", () => {
    const target = "Kısa.";
    expect(advanceNativeReveal("", target, 1000)).toBe(target);
  });
});

describe("native self-echo and barge-in validation", () => {
  const spoken = "Bugün en önemli konu tahsilat sürecini hızlandırmak.";

  it("speech_started alone does not interrupt assistant playback", () => {
    expect(shouldInterruptOnSpeechStarted("speaking")).toBe(false);
    expect(shouldInterruptOnSpeechStarted("thinking")).toBe(true);
  });

  it("preserves Turkish characters while matching punctuation-normalized echo", () => {
    expect(isLikelySelfEcho("tahsilat sürecini!", spoken)).toBe(true);
  });

  it.each([false, true])("routes matching interim/final transcript through the same echo gate", (isFinal) => {
    expect(classifyBargeInTranscript({
      candidate: "önemli konu tahsilat",
      spokenReference: spoken,
      nativeAssistantActive: true,
      isFinal,
    })).toBe("self_echo");
  });

  it("holds a short generic native transcript without cancelling or creating a user turn", () => {
    expect(classifyBargeInTranscript({
      candidate: "Çok teşekkürler",
      spokenReference: spoken,
      nativeAssistantActive: true,
      isFinal: true,
    })).toBe("suspicious");
  });

  it("does not permanently ban the same acknowledgement while assistant audio is inactive", () => {
    expect(classifyBargeInTranscript({
      candidate: "Çok teşekkürler",
      spokenReference: "",
      nativeAssistantActive: false,
      isFinal: true,
    })).toBe("user_speech");
  });

  it("accepts an explicit interrupt immediately and a genuinely different sentence normally", () => {
    expect(classifyBargeInTranscript({
      candidate: "dur",
      spokenReference: spoken,
      nativeAssistantActive: true,
      isFinal: false,
    })).toBe("interrupt_command");
    expect(classifyBargeInTranscript({
      candidate: "Bunun yerine satış planını konuşalım",
      spokenReference: spoken,
      nativeAssistantActive: true,
      isFinal: false,
    })).toBe("user_speech");
  });

  it("clears the 200 ms confirmation timer on reset and rejects stale-turn callbacks", () => {
    const source = readFileSync(
      new URL("../useVoiceExperienceOrchestrator.ts", import.meta.url),
      "utf8",
    );
    const resetBranch = source.slice(
      source.indexOf("const resetTurnState = useCallback"),
      source.indexOf("const enqueueSentence = useCallback"),
    );
    expect(source).toContain("const BARGE_IN_CONFIRMATION_TIMEOUT_MS = 200");
    expect(resetBranch).toContain("clearBargeInConfirmationTimer()");
    expect(source).toContain("pendingTurnGeneration === turnGenerationRef.current");
  });
});

describe("native transcript terminal finalization", () => {
  const base = {
    targetText: "Bugün en önemli",
    revealedText: "Bugün",
    transcriptDone: true,
    responseTerminal: true,
    audioPlaybackStopped: true,
    responseStatus: "completed",
    alreadyCommitted: false,
  };

  it("response.done cannot bypass paced reveal with a full permanent commit", () => {
    expect(decideNativeFinalization(base)).toEqual({
      shouldFinalize: false,
      commitText: "",
    });
  });

  it("commits exactly once only after target reveal and terminal response", () => {
    const ready = decideNativeFinalization({
      ...base,
      revealedText: base.targetText,
    });
    expect(ready).toEqual({ shouldFinalize: true, commitText: base.targetText });
    expect(decideNativeFinalization({
      ...base,
      revealedText: base.targetText,
      alreadyCommitted: true,
    }).shouldFinalize).toBe(false);
  });

  it("waits for transcript.done regardless of output-audio/response terminal ordering", () => {
    expect(decideNativeFinalization({
      ...base,
      revealedText: base.targetText,
      transcriptDone: false,
    }).shouldFinalize).toBe(false);
    expect(decideNativeFinalization({
      ...base,
      revealedText: base.targetText,
      responseTerminal: false,
    }).shouldFinalize).toBe(false);
    expect(decideNativeFinalization({
      ...base,
      revealedText: base.targetText,
      audioPlaybackStopped: false,
    }).shouldFinalize).toBe(false);
  });

  it.each([
    [true, true, false],
    [true, false, true],
    [false, true, true],
  ])(
    "remains pending when transcript=%s terminal=%s audioStopped=%s",
    (transcriptDone, responseTerminal, audioPlaybackStopped) => {
      expect(decideNativeFinalization({
        ...base,
        revealedText: base.targetText,
        transcriptDone,
        responseTerminal,
        audioPlaybackStopped,
      }).shouldFinalize).toBe(false);
    },
  );

  it.each(["cancelled", "failed"])("%s response preserves only the revealed prefix", (responseStatus) => {
    expect(decideNativeFinalization({ ...base, responseStatus })).toEqual({
      shouldFinalize: true,
      commitText: "Bugün",
    });
  });

  it("does not append an empty partial on cancellation", () => {
    expect(decideNativeFinalization({
      ...base,
      revealedText: "",
      responseStatus: "cancelled",
    })).toEqual({ shouldFinalize: true, commitText: "" });
  });

  it("keeps consecutive turns isolated when each starts from an empty reveal", () => {
    const first = advanceNativeReveal("", "Birinci yanıt", 1);
    const second = advanceNativeReveal("", "İkinci yanıt", 1);
    expect(first).toBe("Birinci");
    expect(second).toBe("İkinci");
    expect(second).not.toContain(first);
  });

  it("clears the reveal interval during reset/unmount cleanup", () => {
    vi.useFakeTimers();
    const timer = setInterval(() => undefined, 24);
    expect(vi.getTimerCount()).toBe(1);
    expect(clearNativeRevealTimer(timer)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
