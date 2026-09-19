import { describe, expect, it, vi } from "vitest";

import { calculateUsageCostCents, persistTextRunUsage } from "../../src/lib/platform/usage-telemetry";

describe("usage pricing", () => {
  it("prices Sol input, cached input, and output from its versioned rate card", () => {
    expect(calculateUsageCostCents({ model: "gpt-5.6-sol", inputTokens: 272_000, cachedInputTokens: 0, outputTokens: 1_000_000 })).toBe(2108n);
  });

  it("uses the official long-context multiplier for the entire Sol request", () => {
    expect(calculateUsageCostCents({ model: "gpt-5.6-sol", inputTokens: 273_000, cachedInputTokens: 0, outputTokens: 1_000_000 })).toBe(3218n);
  });

  it("prices Live duration by second without inventing token prices", () => {
    expect(calculateUsageCostCents({ model: "gpt-live-1", liveSeconds: 60 })).toBe(5n);
  });

  it("treats absent, empty, and malformed raw response metadata as a no-op", () => {
    const persist = vi.fn();
    expect(() => persistTextRunUsage({ userId: "u", organizationId: "o", turnId: "t", rawResponses: undefined }, persist)).not.toThrow();
    expect(() => persistTextRunUsage({ userId: "u", organizationId: "o", turnId: "t", rawResponses: [] }, persist)).not.toThrow();
    expect(() => persistTextRunUsage({ userId: "u", organizationId: "o", turnId: "t", rawResponses: [{}] }, persist)).not.toThrow();
    expect(persist).not.toHaveBeenCalled();
  });

  it("passes valid usage to persistence and contains a synchronous persistence failure", () => {
    const persist = vi.fn().mockImplementation(() => { throw new Error("telemetry unavailable"); });
    expect(() => persistTextRunUsage({ userId: "u", organizationId: "o", turnId: "t", rawResponses: [{ requestId: "r", usage: { inputTokens: 10, outputTokens: 2, inputTokensDetails: { cached_tokens: 3 }, outputTokensDetails: { reasoning_tokens: 1 } } }] }, persist)).not.toThrow();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ userId: "u", organizationId: "o", requestId: "r", cachedInputTokens: 3, reasoningTokens: 1 }));
  });
});
