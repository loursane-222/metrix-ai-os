/**
 * Deterministic, timer-gated safety net for natural conversational
 * continuity (METRIX — Natural Conversational Continuity operation).
 *
 * The opening model (opening-delivery.ts) already decides, from the
 * request's own semantics, whether an immediate natural reaction is
 * warranted — that stays the primary, content-aware engagement mechanism.
 * This guard exists only for the case that decision cannot see: real
 * backend latency (classification, evidence assembly, model reasoning)
 * that runs long regardless of how "simple" the question looked, leaving
 * the user in unexplained silence even though the opening model correctly
 * judged the question didn't need an opening sentence.
 *
 * It speaks at most two FIXED, closed-grammar phrases per turn, spaced by
 * rolling silence (not a blind repeating timer — each check re-measures
 * actual silence since the last real activity, including its own prior
 * phrase), and never claims anything about business content, a specific
 * tool, or a specific number of sources — only that work is continuing.
 * A timer decides WHEN to speak; it never decides WHAT is said.
 */

export type ContinuityGuard = {
  /** Call whenever real content (opening sentence or Executive text) is delivered. Resets the silence clock. */
  markActivity: () => void;
  /** Stop all pending timers. Call once the turn is fully done or aborted. */
  cancel: () => void;
};

const GUARD_PHRASES: readonly { afterMs: number; text: string }[] = [
  { afterMs: 2500, text: "Bir saniye, sana doğru cevabı hazırlıyorum." },
  { afterMs: 6000, text: "Bunu netleştiriyorum, birazdan sana dönüyorum." },
];

export function createContinuityGuard(input: {
  signal: AbortSignal;
  speak: (text: string) => void;
}): ContinuityGuard {
  let phraseIndex = 0;
  let lastActivityAt = performance.now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  function scheduleNext() {
    if (cancelled || input.signal.aborted || phraseIndex >= GUARD_PHRASES.length) return;
    const { afterMs, text } = GUARD_PHRASES[phraseIndex]!;
    const dueIn = afterMs - (performance.now() - lastActivityAt);
    timer = setTimeout(() => {
      if (cancelled || input.signal.aborted) return;
      const silentFor = performance.now() - lastActivityAt;
      if (silentFor >= afterMs) {
        input.speak(text);
        phraseIndex++;
        lastActivityAt = performance.now();
        scheduleNext();
      } else {
        scheduleNext();
      }
    }, Math.max(0, dueIn));
  }
  scheduleNext();

  return {
    markActivity: () => { lastActivityAt = performance.now(); },
    cancel: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  };
}
