import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createContinuityGuard } from "../continuity-guard";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("continuity guard — deterministic silence watchdog", () => {
  it("speaks the first phrase only after real silence, never earlier", () => {
    const spoken: string[] = [];
    createContinuityGuard({ signal: new AbortController().signal, speak: (text) => spoken.push(text) });
    vi.advanceTimersByTime(2499);
    expect(spoken).toEqual([]);
    vi.advanceTimersByTime(2);
    expect(spoken).toHaveLength(1);
  });

  it("markActivity resets the silence clock — a phrase already due does not fire once real content arrived", () => {
    const spoken: string[] = [];
    const guard = createContinuityGuard({ signal: new AbortController().signal, speak: (text) => spoken.push(text) });
    vi.advanceTimersByTime(2000);
    guard.markActivity();
    vi.advanceTimersByTime(2000); // 2s since activity, still under the 2.5s threshold
    expect(spoken).toEqual([]);
    vi.advanceTimersByTime(600); // now 2.6s since activity
    expect(spoken).toHaveLength(1);
  });

  it("speaks at most two distinct phrases, then stays silent for the rest of the turn", () => {
    const spoken: string[] = [];
    createContinuityGuard({ signal: new AbortController().signal, speak: (text) => spoken.push(text) });
    vi.advanceTimersByTime(30_000);
    expect(spoken).toHaveLength(2);
    expect(new Set(spoken).size).toBe(2); // the two phrases are not identical
    vi.advanceTimersByTime(60_000);
    expect(spoken).toHaveLength(2); // no further, repeated firing
  });

  it("never speaks after the signal aborts, even if a phrase was already due", () => {
    const spoken: string[] = [];
    const controller = new AbortController();
    createContinuityGuard({ signal: controller.signal, speak: (text) => spoken.push(text) });
    vi.advanceTimersByTime(2000);
    controller.abort();
    vi.advanceTimersByTime(30_000);
    expect(spoken).toEqual([]);
  });

  it("cancel() stops all pending timers immediately", () => {
    const spoken: string[] = [];
    const guard = createContinuityGuard({ signal: new AbortController().signal, speak: (text) => spoken.push(text) });
    guard.cancel();
    vi.advanceTimersByTime(30_000);
    expect(spoken).toEqual([]);
  });
});
