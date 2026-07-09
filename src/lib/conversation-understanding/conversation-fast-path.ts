import type { ConversationUnderstanding } from "./conversation-understanding.types";

// Deterministic, zero-LLM-call bypass for classifyConversation() — used only
// when a turn is unambiguously low-risk small talk (greeting, mic check,
// bare acknowledgment). Every check below is conservative by design: a
// false negative here (missing a safe bypass) just costs the normal LLM
// round-trip; a false positive (bypassing something that wasn't actually
// general chat) could route a real business question away from Executive
// Brain, which is not acceptable. Any business-context signal, any
// open-ended agenda/advice question, or any message beyond a short length
// falls through to the real classifier.

const MAX_FAST_PATH_LENGTH = 32;

const TRAILING_PUNCTUATION = /[.,!?…"'’]+$/;

function normalize(message: string): string {
  return message.trim().toLowerCase().replace(TRAILING_PUNCTUATION, "").trim();
}

// Presence of any of these anywhere in the message disqualifies the fast
// path outright, regardless of length or whitelist match. ASCII-folded
// variants included since this is speech-to-text transcription, where
// diacritics are often dropped.
const BUSINESS_CONTEXT_KEYWORDS = [
  "şirket", "sirket",
  "satış", "satis",
  "tahsilat",
  "müşteri", "musteri",
  "finans",
  "operasyon",
  "karar",
  "rapor",
  "hedef",
  "ekip",
];

// Open-ended agenda / advice-seeking questions can turn into real business
// reasoning even when phrased generically — these must always reach the
// real classifier.
const AGENDA_QUESTION_PATTERNS = [
  /ne yapaca(ğ|g)ız/,
  /ne (ö|o)nerirsin/,
  /neye odaklanal(ı|i)m/,
  /ne yapmal(ı|i)y(ı|i)z/,
  /(ö|o)ner(i|ir)? misin/,
  /g(ü|u)ndem/,
  /bug(ü|u)n(.*)? ne/,
];

// Exact-match only — deliberately not substring matching, so a message that
// merely contains a greeting alongside other content (e.g. "merhaba,
// satışlar nasıl gitti") never qualifies.
const GENERAL_CHAT_WHITELIST = new Set([
  // greetings
  "merhaba", "selam", "selamlar", "günaydın", "gunaydin",
  "iyi günler", "iyi gunler", "iyi akşamlar", "iyi aksamlar", "iyi geceler",
  // well-being
  "nasılsın", "nasilsin", "nasılsınız", "nasilsiniz", "naber", "ne haber",
  // voice / mic check
  "test", "test test", "ses kontrolü", "ses kontrolu", "ses kontrol",
  "duyuyor musun", "beni duyuyor musun", "sesimi duyuyor musun", "duyabiliyor musun",
  // bare acknowledgments
  "tamam", "tamamdır", "tamamdir", "peki", "evet", "hayır", "hayir",
  "anladım", "anladim", "olur",
  // thanks / farewell
  "teşekkürler", "tesekkurler", "teşekkür ederim", "tesekkur ederim",
  "sağol", "sagol", "sağ ol", "sag ol", "sağolun", "sagolun",
  "görüşürüz", "gorusuruz", "hoşça kal", "hosca kal", "hoşçakal", "hoscakal",
]);

export function tryFastPathClassification(
  rawMessage: string,
): { understanding: ConversationUnderstanding; matchedRule: string } | null {
  const normalized = normalize(rawMessage);
  if (!normalized || normalized.length > MAX_FAST_PATH_LENGTH) return null;

  const lowerFull = rawMessage.toLowerCase();
  if (BUSINESS_CONTEXT_KEYWORDS.some((keyword) => lowerFull.includes(keyword))) return null;
  if (AGENDA_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized))) return null;
  if (!GENERAL_CHAT_WHITELIST.has(normalized)) return null;

  return {
    matchedRule: "general_chat_whitelist",
    understanding: {
      conversationKind: "general_chat",
      userMotivation: "sohbet_etmek",
      companyRelevance: "none",
      actionExpectation: "none",
      confidence: "high",
      shouldAskClarification: false,
      shouldInvokeExecutiveBrain: false,
      suggestedHandling: "answer_only",
      reasoning: {
        summary: "Deterministik fast-path: kısa selamlama/onay/ses-kontrol mesajı, iş bağlamı sinyali yok.",
        observations: [],
        uncertainty: [],
        whyThisHandling: "Mesaj sabit, düşük riskli bir listeyle eşleşti; classifyConversation atlandı.",
      },
    },
  };
}
