import type { ExecutiveConversationState } from "@/lib/ai/executive-conversation.types";

// Deterministic, zero-LLM-call gate that decides whether a voice turn is a
// request to transform the PREVIOUS answer (simplify/shorten/repeat/expand/
// rephrase/clarify) rather than a new question. This never generates reply
// text — it only classifies intent so the caller can decide which generator
// to invoke and what to preserve from the previous reasoning outcome.
//
// Conservative by design: any signal that makes the intent ambiguous
// (message too long, mixed with new business content, or no previous AI
// message to transform at all) resolves to "ambiguous" so the caller falls
// back to the full blocking pipeline instead of guessing.

export type ContinuityTransformationKind =
  | "simplify"
  | "shorten"
  | "repeat"
  | "expand"
  | "rephrase"
  | "clarify";

export type ContinuityAmbiguousReason =
  | "no_previous_ai_message"
  | "mixed_intent"
  | "message_too_long"
  | "elliptical_fragment";

export type ContinuityDetectionResult =
  | {
      outcome: "continuity";
      confidence: "high";
      matchedPhrase: string;
      transformationKind: ContinuityTransformationKind;
    }
  | {
      outcome: "new_topic";
      confidence: "high";
    }
  | {
      outcome: "ambiguous";
      confidence: "low";
      reason: ContinuityAmbiguousReason;
    };

export type ContinuityDetectionInput = {
  message: string;
  previousConversationState: ExecutiveConversationState | null;
  hasPreviousAiMessage: boolean;
};

// Requests to transform a previous answer are short spoken utterances in
// practice ("kısalt", "biraz daha basit anlatır mısın"). A longer message
// that happens to contain one of these phrases is more likely a new,
// substantive question layered on top of a transformation request — treat
// that as ambiguous rather than silently dropping the new content.
const MAX_CONTINUITY_MESSAGE_LENGTH = 60;

// Presence of any of these anywhere in an otherwise-short, phrase-matched
// message means the turn is carrying new business content alongside the
// transformation request — not a pure reformulation of what was already
// said.
const BUSINESS_CONTEXT_KEYWORDS = [
  "sirket", "satis", "tahsilat", "musteri", "finans", "operasyon",
  "hedef", "ekip", "teklif", "odeme", "personel", "butce",
];

const TRANSFORMATION_PHRASES: ReadonlyArray<{
  phrase: string;
  kind: ContinuityTransformationKind;
}> = [
  { phrase: "daha sade anlat", kind: "simplify" },
  { phrase: "daha sade soyle", kind: "simplify" },
  { phrase: "sadelestir", kind: "simplify" },
  { phrase: "biraz daha basit", kind: "simplify" },
  { phrase: "daha basit anlat", kind: "simplify" },
  { phrase: "daha basit soyle", kind: "simplify" },
  { phrase: "basitce anlat", kind: "simplify" },
  { phrase: "kisalt", kind: "shorten" },
  { phrase: "ozetle", kind: "shorten" },
  { phrase: "kisa tut", kind: "shorten" },
  { phrase: "kisaca soyle", kind: "shorten" },
  { phrase: "tekrar et", kind: "repeat" },
  { phrase: "tekrarla", kind: "repeat" },
  { phrase: "bir daha soyle", kind: "repeat" },
  { phrase: "yeniden soyle", kind: "repeat" },
  { phrase: "bunu ac", kind: "expand" },
  { phrase: "biraz ac", kind: "expand" },
  { phrase: "detaylandir", kind: "expand" },
  { phrase: "daha detayli anlat", kind: "expand" },
  { phrase: "genislet", kind: "expand" },
  { phrase: "baska turlu soyle", kind: "rephrase" },
  { phrase: "farkli soyle", kind: "rephrase" },
  { phrase: "baska sekilde anlat", kind: "rephrase" },
  { phrase: "daha net soyle", kind: "clarify" },
  { phrase: "netlestir", kind: "clarify" },
  { phrase: "daha acik soyle", kind: "clarify" },
];

function normalizeForMatch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[.,!?;:…"'()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findMatchedPhrase(
  normalized: string,
): { phrase: string; kind: ContinuityTransformationKind } | null {
  for (const entry of TRANSFORMATION_PHRASES) {
    if (normalized.includes(entry.phrase)) {
      return entry;
    }
  }
  return null;
}

// Elliptical/discourse-fragment follow-ups after a barge-in ("Hani…",
// "Yani…", "O değil.", "Devam et.") don't match any TRANSFORMATION_PHRASES
// entry — they're not a "restate/simplify/shorten the previous answer"
// request — but they are just as dependent on the previous turn: their
// meaning is inherited entirely from context, not carried by the words
// themselves. Keep the word-count ceiling only as a guard, then require a
// discourse/deictic signal; word count alone would wrongly capture compact,
// self-contained questions such as "Saat kaç?" or "Teklif hazır mı?".
const MAX_ELLIPTICAL_FRAGMENT_WORDS = 4;

function isLikelyEllipticalFragment(normalized: string): boolean {
  if (!normalized) return false;
  const wordCount = normalized.split(" ").filter(Boolean).length;
  if (wordCount === 0 || wordCount > MAX_ELLIPTICAL_FRAGMENT_WORDS) return false;

  // Linguistic classes, not an example catalogue: discourse particles,
  // context-pointing pronouns/adverbs, and continuation/repair imperatives.
  return (
    /^(hani|yani|şey|sey|peki|hayır|hayir)\b/u.test(normalized) ||
    /^(o|bu|şu|su|onu|bunu|şunu|sunu)\b/u.test(normalized) ||
    /^(az once|demin)\b/u.test(normalized) ||
    /^(devam|dur|bekle)\b/u.test(normalized) ||
    /^bir dakika$/u.test(normalized) ||
    /^nasil yani$/u.test(normalized)
  );
}

export function detectConversationContinuity(
  input: ContinuityDetectionInput,
): ContinuityDetectionResult {
  const normalized = normalizeForMatch(input.message);
  const matched = findMatchedPhrase(normalized);

  if (!matched) {
    // No fixed phrase matched, but a short fragment right after an active
    // AI turn is far more likely a barge-in resumption ("Hani…") than a
    // self-sufficient new topic — defer to the blocking pipeline (which has
    // the fuller Executive Brain/Operating Context) instead of guessing,
    // same conservative principle as the other ambiguous branches below.
    // With no previous AI message, "Merhaba" etc. must still resolve to a
    // normal new-topic greeting.
    if (input.hasPreviousAiMessage && isLikelyEllipticalFragment(normalized)) {
      return {
        outcome: "ambiguous",
        confidence: "low",
        reason: "elliptical_fragment",
      };
    }
    return { outcome: "new_topic", confidence: "high" };
  }

  if (!input.hasPreviousAiMessage) {
    return {
      outcome: "ambiguous",
      confidence: "low",
      reason: "no_previous_ai_message",
    };
  }

  if (normalized.length > MAX_CONTINUITY_MESSAGE_LENGTH) {
    return {
      outcome: "ambiguous",
      confidence: "low",
      reason: "message_too_long",
    };
  }

  if (BUSINESS_CONTEXT_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return {
      outcome: "ambiguous",
      confidence: "low",
      reason: "mixed_intent",
    };
  }

  return {
    outcome: "continuity",
    confidence: "high",
    matchedPhrase: matched.phrase,
    transformationKind: matched.kind,
  };
}
