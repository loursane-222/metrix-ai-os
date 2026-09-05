import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = readFileSync(resolve(root, "src/app/api/ai/chat/route.ts"), "utf8");
const orchestrator = readFileSync(resolve(root, "src/components/metrix-tab/voice/useVoiceExperienceOrchestrator.ts"), "utf8");
const tts = readFileSync(resolve(root, "src/app/api/ai/chat/voice/tts/route.ts"), "utf8");

describe("transport-only voice authority", () => {
  it("has no independent acknowledgement response route", () => {
    expect(existsSync(resolve(root, "src/app/api/ai/chat/voice/ack/route.ts"))).toBe(false);
    expect(orchestrator).not.toContain("/api/ai/chat/voice/ack");
  });

  it("marks every spoken text phase as main-model owned", () => {
    // Only one phase exists now ("primary") — the second, independent
    // "enrichment" model call (pipeline C) was retired by the Unified
    // Executive Turn Runtime consolidation; there is exactly one response
    // owner per turn, so there is exactly one phase to mark.
    expect(route).toContain('phase: "primary", responseAuthority: "metrix_main_model"');
    expect(route).not.toContain('phase: "enrichment"');
    expect(route).toContain('"X-Metrix-Response-Authority": "canonical-http-pipeline"');
    expect(route).toContain('nativeResponseGeneration: false');
  });

  it("continues to sentence-plan canonical chunks into streaming TTS", () => {
    expect(orchestrator).toContain("const onChunk = useCallback((deltaText: string) =>");
    expect(orchestrator).toContain("enqueueSentence(sentence);");
    expect(tts).toContain('model: "gpt-4o-mini-tts"');
    expect(tts).toContain('stream_format: "audio"');
    expect(tts).toContain('"Content-Type": "audio/pcm"');
  });
});
