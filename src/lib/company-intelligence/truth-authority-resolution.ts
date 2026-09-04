import type { TruthAuthorityResolution } from "./types";

export type AuthorityCandidateRule = {
  readonly sourceId: string;
  readonly role: "PRIMARY" | "SECONDARY";
};

/**
 * Pure, deterministic authority arbitration — no I/O, no LLM (rule 1 of the
 * operation's Truth Authority section). Callers pass in sources already
 * split into healthy/unhealthy so this function never has to reason about
 * health itself; see truth-authority.ts's resolveTruthAuthority for the
 * real split and the DB-backed lookup.
 */
export function resolveTruthAuthorityFromCandidates(params: {
  readonly rules: readonly AuthorityCandidateRule[];
  readonly healthyEligibleSourceIds: readonly string[];
  readonly unhealthyEligibleSourceIds: readonly string[];
}): TruthAuthorityResolution {
  if (params.healthyEligibleSourceIds.length === 0) {
    if (params.unhealthyEligibleSourceIds.length > 0) return { status: "SOURCE_UNAVAILABLE", sourceIds: params.unhealthyEligibleSourceIds };
    return { status: "UNCONFIGURED_NO_SOURCE" };
  }

  const applicableRules = params.rules.filter((rule) => params.healthyEligibleSourceIds.includes(rule.sourceId));
  const primaries = applicableRules.filter((rule) => rule.role === "PRIMARY");
  const distinctPrimarySourceIds = Array.from(new Set(primaries.map((rule) => rule.sourceId)));

  if (distinctPrimarySourceIds.length === 1) {
    const supporting = applicableRules.filter((rule) => rule.role === "SECONDARY" && rule.sourceId !== distinctPrimarySourceIds[0]).map((rule) => rule.sourceId);
    return { status: "RESOLVED", primarySourceId: distinctPrimarySourceIds[0], supportingSourceIds: Array.from(new Set(supporting)) };
  }
  if (distinctPrimarySourceIds.length > 1) {
    // Two sources both configured as PRIMARY for the same scope — explicit
    // misconfiguration. Never guess between them (rule 6).
    return { status: "CONFLICT", candidateSourceIds: distinctPrimarySourceIds };
  }

  // No configured PRIMARY at all. Exactly one eligible source is not a
  // disagreement to arbitrate — it's the only candidate there is.
  if (params.healthyEligibleSourceIds.length === 1) {
    return { status: "UNCONFIGURED_SINGLE_SOURCE", sourceId: params.healthyEligibleSourceIds[0] };
  }
  // Multiple eligible, healthy sources and none configured as authoritative
  // — real ambiguity, surfaced rather than silently resolved (rule 5).
  return { status: "CONFLICT", candidateSourceIds: params.healthyEligibleSourceIds };
}

export function describeFreshnessFromTimestamp(observedAtIso: string | null, now: Date = new Date()): "LIVE" | "RECENT" | "STALE" | "UNKNOWN" {
  if (!observedAtIso) return "UNKNOWN";
  const ageMs = now.getTime() - new Date(observedAtIso).getTime();
  if (ageMs < 60_000) return "LIVE";
  if (ageMs < 24 * 60 * 60_000) return "RECENT";
  return "STALE";
}
