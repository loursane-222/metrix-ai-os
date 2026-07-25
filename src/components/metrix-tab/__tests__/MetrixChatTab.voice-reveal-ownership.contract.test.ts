import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const chat = readFileSync(
  resolve(process.cwd(), "src/components/metrix-tab/MetrixChatTab.tsx"),
  "utf8",
);
const orchestrator = readFileSync(
  resolve(
    process.cwd(),
    "src/components/metrix-tab/voice/useVoiceExperienceOrchestrator.ts",
  ),
  "utf8",
);

describe("MetrixChatTab voice reveal ownership", () => {
  const doneBranch = chat.slice(
    chat.indexOf('} else if (event.type === "done")'),
    chat.indexOf('} else if (event.type === "error")'),
  );
  const interruptCallback = chat.slice(
    chat.indexOf("(revealedTextAtInterrupt) =>"),
    chat.indexOf("undefined,", chat.indexOf("(revealedTextAtInterrupt) =>")),
  );
  const playbackCallback = chat.slice(
    chat.indexOf("() => {", chat.indexOf("undefined,")),
    chat.indexOf(");", chat.indexOf("undefined,")),
  );

  it("keeps the canonical voice response pending until real playback completion", () => {
    const pendingWrite = doneBranch.indexOf("pendingVoiceCanonicalRef.current");
    const streamDone = doneBranch.indexOf("orchestrator.onStreamDone()");
    const voiceBranch = doneBranch.slice(
      doneBranch.indexOf("if (isVoice) {"),
      doneBranch.indexOf("} else if (finalContent.trim())"),
    );
    expect(pendingWrite).toBeGreaterThan(-1);
    expect(streamDone).toBeGreaterThan(pendingWrite);
    expect(voiceBranch).not.toContain(
      'setMessages((prev) => [...prev, { role: "metrix", content: finalContent }])',
    );
    expect(playbackCallback).toContain(
      "pending.turnId !== activeVoiceTurnIdRef.current",
    );
    expect(playbackCallback).toContain(
      'setMessages((prev) => [...prev, { role: "metrix", content: pending.content }]',
    );
  });

  it("keeps written completion immediate and ignores empty final content", () => {
    expect(doneBranch).toContain("} else if (finalContent.trim()) {");
    expect(doneBranch).toContain(
      'setMessages((prev) => [...prev, { role: "metrix", content: finalContent }]);',
    );
    expect(doneBranch).toContain("pendingVoiceCanonicalRef.current = finalContent.trim()");
  });

  it("transfers ownership only at the TTS queue-empty boundary", () => {
    const queueEmpty = orchestrator.slice(
      orchestrator.indexOf("const handleQueueEmpty = useCallback"),
      orchestrator.indexOf("const handleSentenceScheduled = useCallback"),
    );
    expect(queueEmpty).toContain('setPresence({ kind: "listening" })');
    expect(queueEmpty).toContain("onPlaybackCompleteRef.current?.()");
    expect(queueEmpty.indexOf('setPresence({ kind: "listening" })')).toBeLessThan(
      queueEmpty.indexOf("onPlaybackCompleteRef.current?.()"),
    );
  });

  it("keeps reveal as the sole visible owner while speaking", () => {
    expect(chat).toContain('orchestrator.presence.kind === "speaking" ?');
    expect(chat).toContain(
      "<MetrixBubble text={orchestrator.revealedText} />",
    );
    expect(doneBranch).toContain("setStreamingContent(null)");
  });

  it("cancels pending full content before committing a barge-in partial", () => {
    expect(interruptCallback).toContain("pendingVoiceCanonicalRef.current = null");
    expect(interruptCallback).toContain("activeVoiceTurnIdRef.current = null");
    expect(interruptCallback.indexOf("pendingVoiceCanonicalRef.current = null")).toBeLessThan(
      interruptCallback.indexOf(
        'setMessages((prev) => [...prev, { role: "metrix", content: durableText }])',
      ),
    );
  });

  it("clears pending ownership on error, abort, reset, and a new turn", () => {
    expect(chat.match(/pendingVoiceCanonicalRef\.current = null/g)?.length).toBeGreaterThanOrEqual(8);
    expect(chat).toContain(
      "activeVoiceTurnIdRef.current = isVoice ? turn.turnId : null",
    );
    expect(playbackCallback).toContain(
      "pending.turnId !== activeVoiceTurnIdRef.current",
    );
  });
});
