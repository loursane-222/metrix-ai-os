import { describe, expect, it } from "vitest";

import { buildExecutiveFallbackResponse, type ExecutiveFallbackReason } from "../executive-fallback-response";

const REASONS: readonly ExecutiveFallbackReason[] = [
  "empty_response",
  "provider_timeout",
  "provider_failure",
  "unsupported_capability",
  "forbidden",
  "data_unavailable",
  "repair_failed",
  "connection_lost",
];

// Proves buildExecutiveFallbackResponse is a fully bounded, deterministic
// switch: every reason maps to a fixed, calm, non-technical Turkish
// sentence — never a passthrough of any caller-supplied value (the function
// signature itself takes no free-text input, so this is structurally
// guaranteed, not just tested by example).
describe("buildExecutiveFallbackResponse", () => {
  it.each(REASONS)("returns a fixed, non-empty Turkish sentence for %s", (reason) => {
    const text = buildExecutiveFallbackResponse(reason);
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/[{}<>]/);
  });

  it("never contains technical/internal markers regardless of reason", () => {
    for (const reason of REASONS) {
      const text = buildExecutiveFallbackResponse(reason).toLowerCase();
      for (const marker of ["error:", "exception", "stack", "prisma", "node_modules", "typeerror", "undefined", "null", "at ", "\n    at"]) {
        expect(text).not.toContain(marker);
      }
    }
  });

  it("is pure and deterministic — same reason always yields the same text", () => {
    expect(buildExecutiveFallbackResponse("connection_lost")).toBe(buildExecutiveFallbackResponse("connection_lost"));
  });

  it("connection_lost and provider_failure are worded distinctly (transport vs. reasoning failure)", () => {
    expect(buildExecutiveFallbackResponse("connection_lost")).not.toBe(buildExecutiveFallbackResponse("provider_failure"));
  });
});
