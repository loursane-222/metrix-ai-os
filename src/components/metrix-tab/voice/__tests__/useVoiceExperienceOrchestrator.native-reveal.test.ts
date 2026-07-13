import { describe, it, expect } from "vitest";
import {
  classifyBargeInTranscript,
  consumeNativeTranscriptQueue,
  decideNativeFinalization,
  isLikelySelfEcho,
  shouldInterruptOnSpeechStarted,
} from "../useVoiceExperienceOrchestrator";

describe("native output-audio delta reveal queue", () => {
  it("preserves transcript delta order and releases one word boundary per audio delta", () => {
    let queue = ["Bug", "ün ", "en ", "önemli"];
    const first = consumeNativeTranscriptQueue(queue);
    queue = first.remainingQueue;
    const second = consumeNativeTranscriptQueue(queue);
    expect(first.revealedDelta).toBe("Bugün ");
    expect(second.revealedDelta).toBe("en ");
    expect(second.remainingQueue).toEqual(["önemli"]);
  });

  it("does not expose an unfinished transcript fragment during audio streaming", () => {
    expect(consumeNativeTranscriptQueue(["Bug"])).toEqual({
      revealedDelta: "",
      remainingQueue: ["Bug"],
    });
  });

  it("terminal fallback drains even when no output-audio delta ever arrived", () => {
    let queue = ["Bugün en önemli"];
    let revealed = "";
    while (queue.length > 0) {
      const step = consumeNativeTranscriptQueue(queue, true);
      revealed += step.revealedDelta;
      queue = step.remainingQueue;
    }
    expect(revealed).toBe("Bugün en önemli");
    expect(decideNativeFinalization({
      targetText: "Bugün en önemli",
      revealedText: revealed,
      transcriptDone: true,
      audioEnded: true,
      responseTerminal: true,
      responseStatus: "completed",
      alreadyCommitted: false,
    })).toEqual({ shouldFinalize: true, commitText: "Bugün en önemli" });
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
    const first = consumeNativeTranscriptQueue(["Birinci yanıt"]);
    const second = consumeNativeTranscriptQueue(["İkinci yanıt"]);
    expect(first.revealedDelta).toBe("Birinci ");
    expect(second.revealedDelta).toBe("İkinci ");
    expect(second.revealedDelta).not.toContain(first.revealedDelta);
  });
});
