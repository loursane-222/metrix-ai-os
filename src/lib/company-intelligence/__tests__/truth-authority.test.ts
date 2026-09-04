import { describe, expect, it } from "vitest";
import { resolveTruthAuthorityFromCandidates } from "../truth-authority-resolution";

describe("resolveTruthAuthorityFromCandidates", () => {
  it("resolves to the single configured PRIMARY, carrying SECONDARY sources as supporting", () => {
    const result = resolveTruthAuthorityFromCandidates({
      rules: [
        { sourceId: "accounting-1", role: "PRIMARY" },
        { sourceId: "crm-1", role: "SECONDARY" },
      ],
      healthyEligibleSourceIds: ["accounting-1", "crm-1"],
      unhealthyEligibleSourceIds: [],
    });
    expect(result).toEqual({ status: "RESOLVED", primarySourceId: "accounting-1", supportingSourceIds: ["crm-1"] });
  });

  it("auto-resolves when exactly one source is eligible and nothing is configured — not a guess among several", () => {
    const result = resolveTruthAuthorityFromCandidates({
      rules: [],
      healthyEligibleSourceIds: ["metrix-native-1"],
      unhealthyEligibleSourceIds: [],
    });
    expect(result).toEqual({ status: "UNCONFIGURED_SINGLE_SOURCE", sourceId: "metrix-native-1" });
  });

  it("is CONFLICT when two sources both claim PRIMARY for the same scope — never silently last-write-wins", () => {
    const result = resolveTruthAuthorityFromCandidates({
      rules: [
        { sourceId: "accounting-1", role: "PRIMARY" },
        { sourceId: "accounting-2", role: "PRIMARY" },
      ],
      healthyEligibleSourceIds: ["accounting-1", "accounting-2"],
      unhealthyEligibleSourceIds: [],
    });
    expect(result).toEqual({ status: "CONFLICT", candidateSourceIds: ["accounting-1", "accounting-2"] });
  });

  it("is CONFLICT when multiple sources are eligible and none is configured as authoritative — ambiguity is surfaced, not resolved silently", () => {
    const result = resolveTruthAuthorityFromCandidates({
      rules: [],
      healthyEligibleSourceIds: ["accounting-1", "crm-1"],
      unhealthyEligibleSourceIds: [],
    });
    expect(result).toEqual({ status: "CONFLICT", candidateSourceIds: ["accounting-1", "crm-1"] });
  });

  it("is SOURCE_UNAVAILABLE when the only capable source is unhealthy — never silently falls back to a healthy but non-authoritative one", () => {
    const result = resolveTruthAuthorityFromCandidates({
      rules: [{ sourceId: "accounting-1", role: "PRIMARY" }],
      healthyEligibleSourceIds: [],
      unhealthyEligibleSourceIds: ["accounting-1"],
    });
    expect(result).toEqual({ status: "SOURCE_UNAVAILABLE", sourceIds: ["accounting-1"] });
  });

  it("is UNCONFIGURED_NO_SOURCE when no source is capable at all, healthy or not", () => {
    const result = resolveTruthAuthorityFromCandidates({ rules: [], healthyEligibleSourceIds: [], unhealthyEligibleSourceIds: [] });
    expect(result).toEqual({ status: "UNCONFIGURED_NO_SOURCE" });
  });

  it("ignores a rule for a source that is not in the healthy-eligible set", () => {
    const result = resolveTruthAuthorityFromCandidates({
      rules: [{ sourceId: "stale-rule-source", role: "PRIMARY" }],
      healthyEligibleSourceIds: ["accounting-1"],
      unhealthyEligibleSourceIds: [],
    });
    expect(result).toEqual({ status: "UNCONFIGURED_SINGLE_SOURCE", sourceId: "accounting-1" });
  });
});
