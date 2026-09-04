import { describe, expect, it } from "vitest";
import { normalizeEntityDisplayName, resolveIdentityFromCandidates } from "../identity-resolution";

describe("resolveIdentityFromCandidates", () => {
  it("resolves on a single explicit-mapping candidate without consulting weaker tiers", () => {
    const result = resolveIdentityFromCandidates({
      explicit: [{ canonicalEntityId: "canon-1", method: "EXPLICIT_MAPPING", confidence: 1 }],
      deterministic: [{ canonicalEntityId: "canon-2", method: "DETERMINISTIC_IDENTIFIER", confidence: 0.95 }],
      normalizedName: [],
    });
    expect(result).toEqual({ status: "RESOLVED", canonicalEntityId: "canon-1", method: "EXPLICIT_MAPPING", confidence: 1 });
  });

  it("falls through to the deterministic-identifier tier when explicit has no candidate", () => {
    const result = resolveIdentityFromCandidates({
      explicit: [],
      deterministic: [{ canonicalEntityId: "canon-2", method: "DETERMINISTIC_IDENTIFIER", confidence: 0.95 }],
      normalizedName: [{ canonicalEntityId: "canon-3", method: "EXACT_NORMALIZED_NAME", confidence: 0.8 }],
    });
    expect(result).toEqual({ status: "RESOLVED", canonicalEntityId: "canon-2", method: "DETERMINISTIC_IDENTIFIER", confidence: 0.95 });
  });

  it("falls through to the normalized-name tier when the two stronger tiers have no candidate", () => {
    const result = resolveIdentityFromCandidates({
      explicit: [],
      deterministic: [],
      normalizedName: [{ canonicalEntityId: "canon-3", method: "EXACT_NORMALIZED_NAME", confidence: 0.8 }],
    });
    expect(result).toEqual({ status: "RESOLVED", canonicalEntityId: "canon-3", method: "EXACT_NORMALIZED_NAME", confidence: 0.8 });
  });

  it("never silently picks among multiple candidates in the same tier — AMBIGUOUS instead", () => {
    const result = resolveIdentityFromCandidates({
      explicit: [],
      deterministic: [],
      normalizedName: [
        { canonicalEntityId: "canon-3", method: "EXACT_NORMALIZED_NAME", confidence: 0.8 },
        { canonicalEntityId: "canon-4", method: "EXACT_NORMALIZED_NAME", confidence: 0.8 },
      ],
    });
    expect(result).toEqual({ status: "AMBIGUOUS", candidateCanonicalEntityIds: ["canon-3", "canon-4"] });
  });

  it("does not fall through to a weaker tier once a stronger tier is AMBIGUOUS", () => {
    const result = resolveIdentityFromCandidates({
      explicit: [],
      deterministic: [
        { canonicalEntityId: "canon-1", method: "DETERMINISTIC_IDENTIFIER", confidence: 0.95 },
        { canonicalEntityId: "canon-2", method: "DETERMINISTIC_IDENTIFIER", confidence: 0.95 },
      ],
      normalizedName: [{ canonicalEntityId: "canon-3", method: "EXACT_NORMALIZED_NAME", confidence: 0.8 }],
    });
    expect(result).toEqual({ status: "AMBIGUOUS", candidateCanonicalEntityIds: ["canon-1", "canon-2"] });
  });

  it("is UNRESOLVED when no tier has any candidate at all", () => {
    expect(resolveIdentityFromCandidates({ explicit: [], deterministic: [], normalizedName: [] })).toEqual({ status: "UNRESOLVED" });
  });

  it("collapses duplicate rows pointing at the same canonical entity within one tier to a single RESOLVED, not a false AMBIGUOUS", () => {
    const result = resolveIdentityFromCandidates({
      explicit: [],
      deterministic: [
        { canonicalEntityId: "canon-1", method: "DETERMINISTIC_IDENTIFIER", confidence: 0.95 },
        { canonicalEntityId: "canon-1", method: "DETERMINISTIC_IDENTIFIER", confidence: 0.95 },
      ],
      normalizedName: [],
    });
    expect(result).toEqual({ status: "RESOLVED", canonicalEntityId: "canon-1", method: "DETERMINISTIC_IDENTIFIER", confidence: 0.95 });
  });
});

describe("normalizeEntityDisplayName", () => {
  it("collapses a legal-suffix-bearing name to the same key as its plain form", () => {
    expect(normalizeEntityDisplayName("ATLAS MAKİNA LTD. ŞTİ.")).toBe(normalizeEntityDisplayName("Atlas Makina"));
  });

  it("is case- and whitespace-insensitive", () => {
    expect(normalizeEntityDisplayName("  atlas   makina  ")).toBe(normalizeEntityDisplayName("Atlas Makina"));
  });

  it("does not collapse two genuinely different names", () => {
    expect(normalizeEntityDisplayName("Atlas Makina")).not.toBe(normalizeEntityDisplayName("Atlas Yapı"));
  });
});
