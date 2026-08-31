import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../MetrixChatTab.tsx", import.meta.url), "utf8");

// Regression: the server tags every streamed "chunk" event with a `phase`
// ("opening" | "primary" | "enrichment" — see route.ts's createMetrixOpeningStream
// and its comment: opening-phase text "never nihai kayda girer... ekrandan
// iz bırakmadan silinip yerini asıl cevaba bırakır"), but this client used
// to ignore `event.phase` entirely and concatenate every chunk into the
// same growing buffer. Reproduced live for "selam metrix bana kendinden
// bahseder misin?": the opening call's self-description sentence
// ("Şirketinin AI Genel Müdürüyüm.") streamed straight into the same bubble
// as the start of the real (different) canonical answer, reading as one
// broken, self-contradictory reply — and the same unfiltered chunk stream
// was also forwarded to voice TTS, which cannot "silently erase" spoken
// words the way a text bubble can. Fixed by tracking the active phase and
// resetting the visible/spoken buffer on any transition out of "opening",
// and by never forwarding opening-phase content to TTS at all.
describe("MetrixChatTab opening/primary phase boundary", () => {
  it("tracks which response phase the buffered stream text belongs to", () => {
    expect(source).toContain("const activeChunkPhaseRef = useRef<string | null>(null);");
    expect(source).toContain("activeChunkPhaseRef.current = null;");
  });

  it("replaces, never extends, the opening affordance once the canonical phase begins", () => {
    expect(source).toContain('const chunkPhase = typeof event.phase === "string" ? event.phase : null;');
    expect(source).toContain('activeChunkPhaseRef.current === "opening" && chunkPhase !== "opening"');
    // The reset must clear both the seeded buffer and any not-yet-flushed
    // typing-animation buffer, or a fragment of the opening text could
    // still leak into the primary bubble via the pending-buffer drain.
    expect(source).toMatch(/activeChunkPhaseRef\.current === "opening" && chunkPhase !== "opening"\) \{\s*streamingContentRef\.current = "";\s*pendingBufferRef\.current = "";/);
  });

  it("never speaks the transient opening affordance over voice", () => {
    expect(source).toContain("const isOpeningPhase = chunkPhase ===");
    expect(source).toContain("if (isVoice && !isOpeningPhase) {");
    expect(source).not.toContain("if (isVoice) {\n              orchestrator.onChunk(content);");
  });
});
