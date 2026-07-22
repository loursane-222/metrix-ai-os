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
  return message.trim().toLocaleLowerCase("tr-TR").replace(TRAILING_PUNCTUATION, "").trim();
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
  "fatura",
  "teklif",
  "belge",
  "vergi",
  "mail", "e-posta",
];

const ACTION_PATTERNS = [
  /(?:^|\s)(?:kaydet|getir|oluştur|olustur|sil|hazırla|hazirla|gönder|gonder|işle|isle|ekle|güncelle|guncelle)(?:\s|$)/u,
  /(?:^|\s)(?:müşteri aç|musteri ac)(?:\s|$)/u,
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

// Anchored families cover harmless variations without turning the bypass
// into substring guessing. Business/action guards above always run first.
const GENERAL_CHAT_PATTERNS = [
  /^(?:bug(ü|u)n\s+)?(?:sen\s+)?nas(ı|i)ls(ı|i)n(?:ız|iz)?$/u,
  /^(?:bug(ü|u)n\s+)?ne yap(ı|i)yorsun$/u,
  /^(?:senin\s+)?keyfin nas(ı|i)l$/u,
  /^nas(ı|i)l gidiyor$/u,
  /^(?:çok\s+)?te(s|ş)ekk(ü|u)r(?:ler| ederim)$/u,
  /^sa(ğ|g) ol(?:un)?$/u,
  /^(?:iyi\s+)?g(ö|o)r(ü|u)(s|ş)(ü|u)r(ü|u)z$/u,
  /^kendine iyi bak$/u,
];

// Diagnostic-only reason codes — never derived from or containing message
// content, safe to log verbatim alongside numeric length metadata.
export type FastPathBlockedReason =
  | "empty_after_normalize"
  | "too_long"
  | "business_keyword_present"
  | "action_keyword_present"
  | "agenda_pattern_matched"
  | "not_in_whitelist";

export type FastPathResult =
  | { matched: true; understanding: ConversationUnderstanding; matchedRule: string }
  | { matched: false; blockedReason: FastPathBlockedReason; length: number; normalizedLength: number };

export function tryFastPathClassification(rawMessage: string): FastPathResult {
  const normalized = normalize(rawMessage);
  const length = rawMessage.length;
  const normalizedLength = normalized.length;

  if (!normalized) {
    return { matched: false, blockedReason: "empty_after_normalize", length, normalizedLength };
  }
  if (normalized.length > MAX_FAST_PATH_LENGTH) {
    return { matched: false, blockedReason: "too_long", length, normalizedLength };
  }

  const lowerFull = rawMessage.toLocaleLowerCase("tr-TR");
  if (BUSINESS_CONTEXT_KEYWORDS.some((keyword) => lowerFull.includes(keyword))) {
    return { matched: false, blockedReason: "business_keyword_present", length, normalizedLength };
  }
  if (ACTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { matched: false, blockedReason: "action_keyword_present", length, normalizedLength };
  }
  if (AGENDA_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { matched: false, blockedReason: "agenda_pattern_matched", length, normalizedLength };
  }
  if (
    !GENERAL_CHAT_WHITELIST.has(normalized)
    && !GENERAL_CHAT_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    return { matched: false, blockedReason: "not_in_whitelist", length, normalizedLength };
  }

  return {
    matched: true,
    matchedRule: GENERAL_CHAT_WHITELIST.has(normalized)
      ? "general_chat_whitelist"
      : "general_chat_pattern",
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
