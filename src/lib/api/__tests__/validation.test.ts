import { describe, expect, it } from "vitest";

import { ApiValidationError, optionalIdempotencyKey } from "../validation";

function requestWithHeader(value: string | null): Request {
  const headers = new Headers();
  if (value !== null) headers.set("Idempotency-Key", value);
  return new Request("https://example.com/api/quotes", { method: "POST", headers });
}

describe("optionalIdempotencyKey", () => {
  it("returns undefined when the header is absent (legacy behavior)", () => {
    expect(optionalIdempotencyKey(requestWithHeader(null))).toBeUndefined();
  });

  it("returns the trimmed header value when present", () => {
    expect(optionalIdempotencyKey(requestWithHeader("  quote-abc-123  "))).toBe("quote-abc-123");
  });

  it("rejects an empty (or whitespace-only) header", () => {
    expect(() => optionalIdempotencyKey(requestWithHeader("   "))).toThrow(ApiValidationError);
    try {
      optionalIdempotencyKey(requestWithHeader("   "));
    } catch (error) {
      expect((error as ApiValidationError).status).toBe(400);
    }
  });

  it("accepts a key at exactly 255 characters", () => {
    const key = "a".repeat(255);
    expect(optionalIdempotencyKey(requestWithHeader(key))).toBe(key);
  });

  it("rejects a key longer than 255 characters", () => {
    const key = "a".repeat(256);
    try {
      optionalIdempotencyKey(requestWithHeader(key));
      throw new Error("expected optionalIdempotencyKey to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiValidationError);
      expect((error as ApiValidationError).status).toBe(400);
    }
  });
});
