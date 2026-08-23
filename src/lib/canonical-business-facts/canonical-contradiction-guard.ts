import { ENTITY_PATTERNS, type CanonicalBusinessFacts } from "./canonical-business-facts.service";

// Root Cause 2's real structural fix (see route.ts's progressive-enrichment
// block): the primary answer and the enrichment text come from two
// independent model calls, and until now, the only thing preventing
// enrichment from contradicting a real canonical number was a prompt
// instruction ("if it contradicts, drop it") — a model's own judgment, not
// a guarantee. This makes that guarantee real: enrichment text is checked
// against the org's own canonical counts in code, before any of it reaches
// the client, and a contradicting sentence is removed outright rather than
// asked-nicely-not-to-be-said.

// Deliberately naive sentence split — Turkish thousands-separator dots
// ("1.500") have no following space, so a ". "/"! "/"? " boundary never
// falls inside a number. Over-splitting only ever risks dropping one extra,
// harmless sentence; it can never let a wrong one through, which is the
// only property this function needs.
function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/u).filter((sentence) => sentence.trim().length > 0);
}

// Turkish-formatted integers: "386", "1.500" (dot = thousands separator).
// Any decimal remainder is irrelevant — canonical counts here are always
// whole numbers, so only the integer part could ever contradict one.
function extractNumbers(sentence: string): number[] {
  const matches = sentence.match(/\d{1,3}(?:\.\d{3})+|\d+/gu) ?? [];
  return matches.map((raw) => Number(raw.replace(/\./gu, "")));
}

// Deliberately conservative in the safe direction: a sentence is removed
// once it mentions a canonical entity type AND contains any number that
// does not match that entity's real, canonically-scoped count. This can
// occasionally remove a harmless sentence with an unrelated number near the
// entity word (e.g. "ilk 5 müşteri de bu ay eklendi") — an acceptable
// cost, since enrichment is a best-effort addendum, not the primary answer.
// It can never let a genuinely wrong total or count reach the user.
export function stripContradictingSentences(text: string, facts: readonly CanonicalBusinessFacts[]): string {
  if (!text.trim() || facts.length === 0) return text;
  const kept = splitSentences(text).filter((sentence) => !contradictsAnyFact(sentence, facts));
  return kept.join(" ").trim();
}

function contradictsAnyFact(sentence: string, facts: readonly CanonicalBusinessFacts[]): boolean {
  const normalized = sentence.toLocaleLowerCase("tr-TR");
  for (const fact of facts) {
    const pattern = ENTITY_PATTERNS.find(([entity]) => entity === fact.entity)?.[1];
    if (!pattern || !pattern.test(normalized)) continue;
    const numbers = extractNumbers(sentence);
    if (numbers.some((value) => value !== fact.count)) return true;
  }
  return false;
}
