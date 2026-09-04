import type { ExternalIdentityMatchMethod, IdentityResolution } from "./types";

export type IdentityMatchCandidate = {
  readonly canonicalEntityId: string;
  readonly method: ExternalIdentityMatchMethod;
  readonly confidence: number;
};

/**
 * Pure, deterministic identity-graph decision — no I/O, no LLM. Tiers are
 * tried strongest evidence first; a tier is consulted only when the one
 * above it produced no candidate at all. Exactly one candidate in a tier
 * resolves; more than one is AMBIGUOUS and must never be auto-picked (that
 * would be a silent fuzzy merge of two potentially-distinct real entities —
 * the one thing this operation explicitly forbids). No candidate in any
 * tier is UNRESOLVED, which the caller (identity-graph.ts) turns into
 * minting a brand-new canonical entity — safe, because minting a new
 * identity is never a merge of two existing ones.
 */
export function resolveIdentityFromCandidates(tiers: {
  readonly explicit: readonly IdentityMatchCandidate[];
  readonly deterministic: readonly IdentityMatchCandidate[];
  readonly normalizedName: readonly IdentityMatchCandidate[];
}): IdentityResolution {
  for (const tier of [tiers.explicit, tiers.deterministic, tiers.normalizedName]) {
    const distinctCanonicalEntityIds = Array.from(new Set(tier.map((candidate) => candidate.canonicalEntityId)));
    if (distinctCanonicalEntityIds.length === 1) {
      const winner = tier.find((candidate) => candidate.canonicalEntityId === distinctCanonicalEntityIds[0])!;
      return { status: "RESOLVED", canonicalEntityId: winner.canonicalEntityId, method: winner.method, confidence: winner.confidence };
    }
    if (distinctCanonicalEntityIds.length > 1) {
      return { status: "AMBIGUOUS", candidateCanonicalEntityIds: distinctCanonicalEntityIds };
    }
  }
  return { status: "UNRESOLVED" };
}

/**
 * Normalizes a business display name for the EXACT_NORMALIZED_NAME tier:
 * case/diacritics/whitespace-insensitive, and strips common Turkish legal
 * suffixes so "Atlas Makina" and "ATLAS MAKİNA LTD. ŞTİ." collapse to the
 * same key. Still an exact match on the normalized string, never a
 * similarity score — two names that don't normalize identically simply
 * don't match in this tier.
 */
// Token-based, not \b-regex-based: JS regex \b is defined over ASCII \w, so
// it fails to recognize a boundary next to a Turkish letter (Ş, İ, ...) —
// splitting on non-letter/digit runs instead sidesteps that entirely.
const LEGAL_SUFFIX_TOKENS = new Set(["LTD", "LİMİTED", "LIMITED", "ŞTİ", "STI", "SANAYİ", "SANAYI", "TİCARET", "TICARET"]);

export function normalizeEntityDisplayName(rawName: string): string {
  const tokens = rawName
    .toLocaleUpperCase("tr-TR")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0 && !LEGAL_SUFFIX_TOKENS.has(token));
  return tokens
    .join(" ")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}
