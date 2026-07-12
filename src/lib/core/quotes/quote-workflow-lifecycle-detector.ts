import type { QuoteStatus } from "@prisma/client";
import type { QuoteContextActiveItem } from "./quote-context-builder";
import type {
  QuoteWorkflowSignal,
  QuoteWorkflowSignalType,
} from "./quote-workflow-lifecycle.types";

const SENT_KEYWORDS = [
  "teklifi gönderdim", "teklif gönderdim", "teklif yolladım", "teklifi yolladım",
  "teklif ilettim", "teklifi ilettim", "teklifi mail attım", "teklif mail attım",
  "teklif gönderdik", "teklif yolladık",
];

const VIEWED_KEYWORDS = [
  "müşteri teklifi açtı", "teklifi açtı", "teklifi gördü", "teklifi inceledi",
  "teklifi okudu", "teklife baktı", "müşteri gördü", "müşteri inceledi",
  "teklifi kabul etmeden önce baktı",
];

const NEGOTIATING_KEYWORDS = [
  "fiyat konuşmak istiyor", "pazarlık başladı", "pazarlık yapıyor",
  "müzakere başladı", "müzakere aşamasında", "fiyat üzerinde görüşüyoruz",
  "indirim istiyor", "fiyat düşürmemi istedi", "teklif üzerinde konuşuyoruz",
  "revize istiyor", "fiyat revize",
];

const WON_KEYWORDS = [
  "anlaştık", "teklifi kabul etti", "imzaladı", "sözleşme imzalandı",
  "kapattık", "deal kapandı", "satış gerçekleşti", "onayladı",
  "teklifi onayladı", "siparişi verdi", "sipariş aldık",
];

const LOST_KEYWORDS = [
  "hayır dedi", "teklifi reddetti", "rakip kazandı", "başkasını seçti",
  "geçti", "olmadı", "teklif düştü", "müşteri vazgeçti",
  "bütçesi yok", "bütçesi tutmadı", "başka firmaya gitti",
];

const CANCELLED_KEYWORDS = [
  "teklifi iptal ettim", "teklifini iptal ettim",
  "teklifi iptal ettik", "teklifini iptal ettik",
  "teklif iptal edildi", "teklifi iptal edildi",
  "teklif iptal oldu", "teklifi iptal oldu",
  "teklifi bıraktım", "teklifi bıraktık",
  "teklifi kaldırdım", "teklifi kaldırdık",
  "teklifi kapattım", "teklifi kapattık",
];

// "teklif" bağlamı zorunlu — tek başına "aradım" / "yazdım" tetiklememeli
const FOLLOWED_UP_KEYWORDS = [
  "teklif için aradım", "teklifi takip ettim", "teklif takibi yaptım",
  "teklif üzerine yazdım", "teklif için tekrar mesaj attım",
  "teklife dair görüştüm", "teklif için tekrar ulaştım",
  "teklif için hatırlatma gönderdim",
];

const REVISION_REQUESTED_KEYWORDS = [
  "revize istedi", "revize talep etti", "teklifi revize etmemi istedi",
  "fiyat revizyonu istedi", "yeni fiyat istedi",
  "teklifimi güncellememi istedi", "teklifte değişiklik istedi",
];

// Status-transition signals that require a single unambiguous quote match
const SINGLE_MATCH_REQUIRED: Set<QuoteWorkflowSignalType> = new Set([
  "QUOTE_SENT",
  "QUOTE_VIEWED",
  "QUOTE_NEGOTIATING",
  "QUOTE_WON",
  "QUOTE_LOST",
  "QUOTE_CANCELLED",
  "QUOTE_FOLLOWED_UP",
  "QUOTE_REVISION_REQUESTED",
]);

// Allowed forward transitions only — no regressions
// Event-only signals list allowed active statuses (not allowed on terminal statuses)
const ALLOWED_TRANSITIONS: Record<QuoteWorkflowSignalType, QuoteStatus[]> = {
  QUOTE_SENT: ["DRAFT"],
  QUOTE_VIEWED: ["SENT"],
  QUOTE_NEGOTIATING: ["SENT", "VIEWED"],
  QUOTE_WON: ["SENT", "VIEWED", "NEGOTIATION"],
  QUOTE_LOST: ["SENT", "VIEWED", "NEGOTIATION"],
  QUOTE_CANCELLED: ["DRAFT", "SENT", "VIEWED", "NEGOTIATION"],
  QUOTE_FOLLOWED_UP: ["SENT", "VIEWED", "NEGOTIATION"],
  QUOTE_REVISION_REQUESTED: ["SENT", "VIEWED", "NEGOTIATION"],
};

const SIGNAL_CONFIDENCE_THRESHOLDS: Record<QuoteWorkflowSignalType, number> = {
  QUOTE_SENT: 0.75,
  QUOTE_VIEWED: 0.75,
  QUOTE_NEGOTIATING: 0.70,
  QUOTE_WON: 0.90,
  QUOTE_LOST: 0.85,
  QUOTE_CANCELLED: 0.90,
  QUOTE_FOLLOWED_UP: 0.75,
  QUOTE_REVISION_REQUESTED: 0.78,
};

export { SIGNAL_CONFIDENCE_THRESHOLDS };

export function detectQuoteWorkflowSignals(input: {
  message: string;
  activeItems: QuoteContextActiveItem[];
}): QuoteWorkflowSignal[] {
  if (input.activeItems.length === 0) return [];

  const normalized = input.message.toLowerCase();
  const now = new Date();

  const signalType = detectSignalType(normalized);
  if (!signalType) return [];

  const matches = findMatchingQuotes(normalized, input.activeItems);
  if (matches.length === 0) return [];

  if (SINGLE_MATCH_REQUIRED.has(signalType) && matches.length > 1) {
    return [];
  }

  return matches
    .filter(({ quote }) => isAllowedTransition(signalType, quote.status))
    .map(({ quote, matchScore }) =>
      buildSignal({ signalType, quote, confidence: computeConfidence(signalType, matchScore), now }),
    );
}

function detectSignalType(normalized: string): QuoteWorkflowSignalType | null {
  // Status-changing signals — highest stakes, checked first
  if (hasAnyKeyword(normalized, WON_KEYWORDS)) return "QUOTE_WON";
  if (hasAnyKeyword(normalized, CANCELLED_KEYWORDS)) return "QUOTE_CANCELLED";
  if (hasAnyKeyword(normalized, LOST_KEYWORDS)) return "QUOTE_LOST";
  if (hasAnyKeyword(normalized, NEGOTIATING_KEYWORDS)) return "QUOTE_NEGOTIATING";
  if (hasAnyKeyword(normalized, VIEWED_KEYWORDS)) return "QUOTE_VIEWED";
  if (hasAnyKeyword(normalized, SENT_KEYWORDS)) return "QUOTE_SENT";
  // Event-only signals — checked last to avoid shadowing status transitions
  if (hasAnyKeyword(normalized, REVISION_REQUESTED_KEYWORDS)) return "QUOTE_REVISION_REQUESTED";
  if (hasAnyKeyword(normalized, FOLLOWED_UP_KEYWORDS)) return "QUOTE_FOLLOWED_UP";
  return null;
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

function findMatchingQuotes(
  normalized: string,
  items: QuoteContextActiveItem[],
): { quote: QuoteContextActiveItem; matchScore: number }[] {
  const results: { quote: QuoteContextActiveItem; matchScore: number }[] = [];

  for (const item of items) {
    const matchCandidate = item.personName ?? item.customerName;
    const candidateNormalized = matchCandidate.toLowerCase().trim();
    if (candidateNormalized.length < 4) continue;
    if (normalized.includes(candidateNormalized)) {
      results.push({ quote: item, matchScore: 1.0 });
    }
  }

  return results;
}

function isAllowedTransition(signalType: QuoteWorkflowSignalType, currentStatus: QuoteStatus): boolean {
  return ALLOWED_TRANSITIONS[signalType].includes(currentStatus);
}

function computeConfidence(signalType: QuoteWorkflowSignalType, matchScore: number): number {
  const baseConfidence: Record<QuoteWorkflowSignalType, number> = {
    QUOTE_WON: 0.92,
    QUOTE_CANCELLED: 0.92,
    QUOTE_LOST: 0.88,
    QUOTE_NEGOTIATING: 0.78,
    QUOTE_VIEWED: 0.80,
    QUOTE_SENT: 0.80,
    QUOTE_FOLLOWED_UP: 0.78,
    QUOTE_REVISION_REQUESTED: 0.82,
  };
  return baseConfidence[signalType] * matchScore;
}

function buildSignal(input: {
  signalType: QuoteWorkflowSignalType;
  quote: QuoteContextActiveItem;
  confidence: number;
  now: Date;
}): QuoteWorkflowSignal {
  const { signalType, quote, confidence, now } = input;

  let isEventOnly = false;
  let proposedStatus: QuoteStatus | null = null;
  let proposedNote: string | null = null;
  let proposedSentAt: Date | null = null;
  let proposedViewedAt: Date | null = null;
  let proposedWonAt: Date | null = null;
  let proposedLostAt: Date | null = null;

  switch (signalType) {
    case "QUOTE_SENT":
      proposedStatus = "SENT";
      proposedSentAt = now;
      proposedNote = "Teklif gönderildi.";
      break;

    case "QUOTE_VIEWED":
      proposedStatus = "VIEWED";
      proposedViewedAt = now;
      proposedNote = "Müşteri teklifi görüntüledi.";
      break;

    case "QUOTE_NEGOTIATING":
      proposedStatus = "NEGOTIATION";
      proposedNote = "Müzakere aşamasına geçildi.";
      break;

    case "QUOTE_WON":
      proposedStatus = "WON";
      proposedWonAt = now;
      proposedNote = "Teklif kazanıldı.";
      break;

    case "QUOTE_LOST":
      proposedStatus = "LOST";
      proposedLostAt = now;
      proposedNote = "Teklif kaybedildi.";
      break;

    case "QUOTE_CANCELLED":
      proposedStatus = "CANCELLED";
      proposedNote = "Teklif iptal edildi.";
      break;

    case "QUOTE_FOLLOWED_UP":
      isEventOnly = true;
      proposedNote = "Teklif takibi yapıldı.";
      break;

    case "QUOTE_REVISION_REQUESTED":
      isEventOnly = true;
      proposedNote = "Müşteri revize talep etti.";
      break;
  }

  return {
    quoteId: quote.id,
    signalType,
    confidence,
    matchedCustomerName: quote.customerName,
    currentStatus: quote.status,
    isEventOnly,
    proposedStatus,
    proposedNote,
    proposedSentAt,
    proposedViewedAt,
    proposedWonAt,
    proposedLostAt,
  };
}
