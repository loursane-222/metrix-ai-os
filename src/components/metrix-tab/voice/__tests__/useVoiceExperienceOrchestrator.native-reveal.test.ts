import { describe, it, expect } from "vitest";
import {
  advanceNativeRevealOnPlayback,
  classifyBargeInTranscript,
  countNativeRevealUnits,
  decideNativeFinalization,
  didNativePlaybackAdvance,
  isLikelySelfEcho,
  shouldInterruptOnSpeechStarted,
  shouldStartNativeTerminalCatchUp,
} from "../useVoiceExperienceOrchestrator";

// Final Fix — Native Voice Runtime transcript pacing. Root cause: the
// Realtime API's response.output_audio_transcript.delta stream generates
// far faster than the corresponding spoken audio, so directly mirroring
// Native reveal is driven by actual HTMLAudioElement playback progress. No
// fixed character/ms rate or finite MediaStream duration is assumed.
describe("native audio-clock reveal", () => {
  it("releases one complete word boundary per playback advance", () => {
    const target = "Bugün en önemli";
    const first = advanceNativeRevealOnPlayback("", target);
    const second = advanceNativeRevealOnPlayback(first, target);
    expect(first).toBe("Bugün ");
    expect(second).toBe("Bugün en ");
  });

  it("does not expose an unfinished delta fragment", () => {
    expect(advanceNativeRevealOnPlayback("", "Bug")).toBe("");
    expect(advanceNativeRevealOnPlayback("", "Bugün ")).toBe("Bugün ");
  });

  it("allows the final word only after transcript target is final", () => {
    expect(advanceNativeRevealOnPlayback("Bugün ", "Bugün önemli")).toBe("Bugün ");
    expect(advanceNativeRevealOnPlayback("Bugün ", "Bugün önemli", true)).toBe(
      "Bugün önemli",
    );
  });

  it("advances only while the media element is playing and currentTime moves", () => {
    expect(didNativePlaybackAdvance({ currentTime: 1, isPlaying: true }, null)).toBe(true);
    expect(didNativePlaybackAdvance({ currentTime: 1.2, isPlaying: true }, 1)).toBe(true);
    expect(didNativePlaybackAdvance({ currentTime: 1.2, isPlaying: true }, 1.2)).toBe(false);
    expect(didNativePlaybackAdvance({ currentTime: 2, isPlaying: false }, 1.2)).toBe(false);
  });

  it("allows terminal RAF catch-up only for a small remaining word tail", () => {
    const lifecycle = {
      audioEnded: true,
      responseTerminal: true,
      transcriptDone: true,
    };
    expect(countNativeRevealUnits("Bugün ", "Bugün en önemli konu")).toBe(3);
    expect(shouldStartNativeTerminalCatchUp({ ...lifecycle, remainingUnits: 3 })).toBe(false);
    expect(shouldStartNativeTerminalCatchUp({ ...lifecycle, remainingUnits: 2 })).toBe(true);
    expect(shouldStartNativeTerminalCatchUp({
      ...lifecycle,
      audioEnded: false,
      remainingUnits: 1,
    })).toBe(false);
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
});

describe("native transcript terminal finalization", () => {
  const base = {
    targetText: "Bugün en önemli",
    revealedText: "Bugün",
    transcriptDone: true,
    audioEnded: false,
    responseTerminal: true,
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
      audioEnded: true,
    });
    expect(ready).toEqual({ shouldFinalize: true, commitText: base.targetText });
    expect(decideNativeFinalization({
      ...base,
      revealedText: base.targetText,
      audioEnded: true,
      alreadyCommitted: true,
    }).shouldFinalize).toBe(false);
  });

  it("waits for transcript.done regardless of output-audio/response terminal ordering", () => {
    expect(decideNativeFinalization({
      ...base,
      revealedText: base.targetText,
      audioEnded: true,
      transcriptDone: false,
    }).shouldFinalize).toBe(false);
    expect(decideNativeFinalization({
      ...base,
      revealedText: base.targetText,
      audioEnded: true,
      responseTerminal: false,
    }).shouldFinalize).toBe(false);
  });

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
    const first = advanceNativeRevealOnPlayback("", "Birinci yanıt");
    const second = advanceNativeRevealOnPlayback("", "İkinci yanıt");
    expect(first).toBe("Birinci ");
    expect(second).toBe("İkinci ");
    expect(second).not.toContain(first);
  });
});
