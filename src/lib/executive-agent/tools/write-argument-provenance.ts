/**
 * Stage 1 Production Reliability Closure — write-argument authority.
 *
 * Proven live: a customer's phone number from ~20 turns earlier in the
 * SAME conversation was used as the "new" value for "Bu müşterinin
 * telefonunu değiştir." (no number given this turn) — the Agent's own
 * conversation-history context (legitimate for "which entity are we
 * talking about") was also, wrongly, treated as authority for "what new
 * value did the user just authorize writing".
 *
 * Canonical invariant (domain-independent, not a customer/phone patch):
 * a mutation's new value may come from the CURRENT TURN's own message
 * (explicit, or a direct reply completing a continuation the Agent itself
 * just asked for — which is still, structurally, THIS turn's own message)
 * — never from accumulated conversation history, memory, or model
 * inference alone. This module is the one shared check for that;
 * execute_business_action (action-tools.ts) applies it uniformly to every
 * action whose inputSchema uses the shared `patch: { type: "json" }`
 * convention (customer.update, quote.update, supplier.update,
 * company.profile.update today — automatically covers any future action
 * adopting the same convention, no per-domain registration needed).
 */

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

// A short trailing run of digits (e.g. the last 7 of a phone number) is
// enough to prove "this exact value was said this turn" without being
// defeated by formatting differences (spaces, a country-code prefix a
// normalizer added, punctuation) — while still being specific enough that
// an unrelated short number can't accidentally match.
const DIGIT_SUFFIX_LENGTH = 7;

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
  const normalizedCandidate = normalize(candidate);
  const normalizedMessage = normalize(currentTurnMessage);
  if (!normalizedCandidate) return true;
  if (normalizedMessage.includes(normalizedCandidate)) return true;
  const candidateDigits = candidate.replace(/\D/g, "");
  if (candidateDigits.length >= DIGIT_SUFFIX_LENGTH) {
    const messageDigits = currentTurnMessage.replace(/\D/g, "");
    const suffix = candidateDigits.slice(-DIGIT_SUFFIX_LENGTH);
    if (messageDigits.includes(suffix)) return true;
  }
  return false;
}

export type PatchProvenanceViolation = Readonly<{ field: string; value: unknown }>;

/**
 * Walks a `patch` object (the shared write-value shape — customer.update,
 * quote.update, supplier.update, company.profile.update all use this same
 * `{ patch: {...} }` convention) one level of nesting deep (covers
 * primaryContact.phone-style nested fields) and returns the first leaf
 * whose value has no provenance in `currentTurnMessage`, or null if every
 * leaf checks out.
 */
export function findPatchProvenanceViolation(patch: Record<string, unknown>, currentTurnMessage: string): PatchProvenanceViolation | null {
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
