import { afterEach, expect, it, vi } from "vitest";
import { latencyMark } from "../latency";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it("defers the sink, preserves captured monotonic time, and contains sink failure", () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, "info").mockImplementation(() => { throw new Error("sink unavailable"); });
  latencyMark("server", "turn", "company_request_received", 123);
  expect(log).not.toHaveBeenCalled();
  expect(() => vi.runAllTimers()).not.toThrow();
  expect(log).toHaveBeenCalledWith("[voice-latency]", {
    side: "server", turnId: "turn", event: "company_request_received", monotonicMs: 123,
  });
});
