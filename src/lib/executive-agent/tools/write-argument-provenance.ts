/**
 * Stage 1 Production Reliability Closure — write-argument authority.
 *
 * Proven live: a customer's phone number from ~20 turns earlier in the
 * SAME conversation was used as the "new" value for "Bu müşterinin
 * telefonunu değiştir." (no number given this turn). Semantic context
 * (which entity — activeWorkspaceContext) is legitimate for "which entity
 * are we talking about"; a mutation's actual NEW VALUE is a stricter,
 * separate authority that may only come from the current turn's own
 * message — never accumulated history, memory, or model inference alone.
 *
 * "Canonical pending continuation" (Turn 1 asks a clarifying question,
 * Turn 2 answers it) needs no separate state to track: by the time Turn 2
 * runs, its OWN reply IS that turn's currentTurnMessage — the same check
 * that verifies CURRENT_TURN_EXPLICIT already, structurally, accepts a
 * genuine continuation reply and rejects a value that only ever appeared
 * in an earlier, non-adjacent turn (which is never this turn's own
 * message). There is no conversation-history input to this module at
 * all — that is what makes stale history mechanically impossible to
 * mistake for authority, not a trust-the-model convention.
 */

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

// A trailing run of digits (e.g. the last 7 of a phone number) is enough
// to prove "this exact value was said this turn" without being defeated
// by formatting differences (spaces, a country-code prefix a normalizer
// added) — while staying specific enough that a short, unrelated number
// can't accidentally match. Below this length, only an EXACT token match
// counts (see extractNumberTokens below) — this is what stops "100"
// falsely matching inside "1000".
const DIGIT_SUFFIX_LENGTH = 7;

// Real, standalone number tokens in the message — never a substring of
// the message's own concatenated digit soup. Matching against the
// original digit-soup (stripping all separators first) was the earlier,
// looser version of this check; it let "100" match inside "1000" and let
// two unrelated numbers' digits concatenate into an accidental hit. This
// only accepts digits that appeared together, as one written number
// (optionally with internal spaces/dots/dashes, common in phone/amount
// formatting), in the user's own text.
function extractNumberTokens(text: string): string[] {
  const matches = text.match(/\d(?:[\d\s.,-]*\d)?/g) ?? [];
  return matches.map((token) => token.replace(/\D/g, "")).filter((token) => token.length > 0);
}

/**
 * True if `candidateValue` (a value about to be written) has real
 * provenance in `currentTurnMessage` (this turn's own raw text, never
 * history). Non-string/number leaves (booleans, null, objects, arrays,
 * empty strings) are not checked — there is no free-text claim to verify
 * for them.
 */
export function verifyValueProvenance(candidateValue: unknown, currentTurnMessage: string): boolean {
  if (typeof candidateValue !== "string" && typeof candidateValue !== "number") return true;
  const candidate = String(candidateValue).trim();
  if (!candidate) return true;

  const candidateDigits = candidate.replace(/\D/g, "");
  // A candidate that is ITSELF just a formatted number (a phone number, an
  // amount, a quantity — "905551112233", "5000", "5.000") must be verified
  // against a real number token in the message, exactly (short values) or
  // by a matching trailing-digit suffix (long, phone-like values) — never
  // by a loose substring check, which is exactly what let "100" match
  // inside "1000" or let two unrelated numbers' digits overlap by
  // coincidence.
  if (candidateDigits && /^[\d\s.,()+-]+$/.test(candidate)) {
    const tokens = extractNumberTokens(currentTurnMessage);
    const isLong = candidateDigits.length >= DIGIT_SUFFIX_LENGTH;
    return tokens.some((token) =>
      token === candidateDigits ||
      (isLong && token.length >= DIGIT_SUFFIX_LENGTH && token.slice(-DIGIT_SUFFIX_LENGTH) === candidateDigits.slice(-DIGIT_SUFFIX_LENGTH)),
    );
  }

  // Free text (an address, a status word, a title) — a normalized
  // substring check is appropriate here; it is not vulnerable to the
  // numeric-overlap failure mode above.
  const normalizedCandidate = normalize(candidate);
  if (!normalizedCandidate) return true;
  return normalize(currentTurnMessage).includes(normalizedCandidate);
}

export type WriteValueProvenanceViolation = Readonly<{ field: string; value: unknown }>;

/**
 * Walks a `patch`-shaped object (customer.update/quote.update/
 * supplier.update/company.profile.update's shared `{ patch: {...} }`
 * convention) one level of nesting deep (covers primaryContact.phone-style
 * fields) and returns the first leaf whose value has no provenance in
 * `currentTurnMessage`, or null if every leaf checks out.
 */
export function findPatchProvenanceViolation(patch: Record<string, unknown>, currentTurnMessage: string): WriteValueProvenanceViolation | null {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const nested = findPatchProvenanceViolation(value as Record<string, unknown>, currentTurnMessage);
      if (nested) return { field: `${key}.${nested.field}`, value: nested.value };
      continue;
    }
    if (!verifyValueProvenance(value, currentTurnMessage)) return { field: key, value };
  }
  return null;
}
