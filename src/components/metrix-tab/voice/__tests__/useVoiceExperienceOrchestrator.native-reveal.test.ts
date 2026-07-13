import { describe, it, expect } from "vitest";
import { advanceNativeReveal } from "../useVoiceExperienceOrchestrator";

// Final Fix — Native Voice Runtime transcript pacing. Root cause: the
// Realtime API's response.output_audio_transcript.delta stream generates
// far faster than the corresponding spoken audio, so directly mirroring
// every delta into revealedText (the previous behavior) made the whole
// response appear almost instantly while audio kept playing for several
// more seconds afterward — "text appears, then Metrix reads it" instead of
// "text grows with speech." advanceNativeReveal is the pure function
// startNativeRevealTimer calls on every tick in production (not a parallel
// reimplementation) to grow revealedText toward the known target at a
// bounded rate instead of jumping straight to it.

describe("advanceNativeReveal", () => {
  it("2: reveals the target progressively, a bounded number of characters per call, never skipping to the end", () => {
    const target = "Bugün en önemli";
    let shown = "";
    // Simulate several ticks with a small, deterministic step size.
    for (let i = 0; i < 3; i++) {
      const next = advanceNativeReveal(shown, target, 4);
      expect(next.length).toBeLessThanOrEqual(shown.length + 4);
      expect(target.startsWith(next)).toBe(true);
      shown = next;
    }
    // After only 3 ticks of 4 chars, it must not have reached the full text
    // yet (target is 15 chars, 3*4=12 < 15) — this is the actual guarantee
    // that fixes "whole response appears at once."
    expect(shown.length).toBeLessThan(target.length);
  });

  it("eventually reaches the full target after enough ticks, without exceeding it", () => {
    const target = "Bugün en önemli";
    let shown = "";
    for (let i = 0; i < 20; i++) {
      shown = advanceNativeReveal(shown, target, 2);
    }
    expect(shown).toBe(target);
  });

  it("target growing between ticks (more deltas arrived) is picked up on the next tick", () => {
    let target = "Bugün";
    let shown = advanceNativeReveal("", target, 10); // catches up to "Bugün" immediately (short target)
    expect(shown).toBe("Bugün");

    // More deltas arrive, growing the target — next tick should continue
    // revealing from where it left off, not restart or skip.
    target = "Bugün en önemli";
    shown = advanceNativeReveal(shown, target, 3);
    expect(shown).toBe("Bugün en"); // 5 (prior) + 3 more chars, prefix of target
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
