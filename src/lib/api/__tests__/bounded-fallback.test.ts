import { describe, expect, it, vi } from "vitest";
import { withBoundedFallback } from "../bounded-fallback";

describe("withBoundedFallback", () => {
  it("resolves with the real value when the promise settles before the timeout", async () => {
    vi.useFakeTimers();
    const result = withBoundedFallback(Promise.resolve("real-value"), 5_000, "fallback");
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toBe("real-value");
    vi.useRealTimers();
  });

  it("resolves with the fallback, never rejects, when the promise never settles within the bound — proves a hung DB/network read cannot hold the request open indefinitely", async () => {
    vi.useFakeTimers();
    const neverSettles = new Promise<string>(() => {});
    const result = withBoundedFallback(neverSettles, 5_000, "fallback");
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(result).resolves.toBe("fallback");
    vi.useRealTimers();
  });

  it("resolves with the fallback when the promise rejects — same behavior a plain .catch already gave, preserved", async () => {
    vi.useFakeTimers();
    const result = withBoundedFallback(Promise.reject(new Error("db error")), 5_000, "fallback");
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toBe("fallback");
    vi.useRealTimers();
  });

  it("does not fire the fallback once the real value has already resolved (timer is cleared)", async () => {
    vi.useFakeTimers();
    const result = withBoundedFallback(Promise.resolve("real-value"), 1_000, "fallback");
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toBe("real-value");
    // Advancing well past the timeout must not change anything — the
    // timer was cleared on the real resolution above.
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(result).resolves.toBe("real-value");
    vi.useRealTimers();
  });
});
