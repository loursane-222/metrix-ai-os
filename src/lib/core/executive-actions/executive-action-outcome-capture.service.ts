import type { ExecutiveActionOutcomeStatus } from "./executive-action.types";

export type ExecutiveActionOutcomeSignal = {
  actionId: string;
  actionTitle: string;
  outcomeStatus: ExecutiveActionOutcomeStatus;
  resultSummary: string;
  confidence: number;
};

type OpenActionInput = {
  id: string;
  title: string;
  reason: string;
};

// ─── Türkçe anahtar kelime setleri ───────────────────────────────────────────

const SUCCESS_KW = [
  "ödeme aldım", "tahsil ettim", "tahsilat geldi", "tahsilatı geldi",
  "tahsilat aldım", "ödemesi geldi", "parası geldi",
  "ödedi", "gönderdi", "yatırdı", "aktardı", "imzaladı", "onayladı",
  "kabul etti", "anlaştık", "kesinleşti", "hallettik", "çözdük",
  "başarıyla tamamlandı", "sözleşme imzalandı", "transfer geldi",
  "havale geldi", "eft geldi", "para geldi", "ödeme onaylandı",
  "tahsilat yapıldı", "ödeme yapıldı",
];

const PARTIAL_KW = [
  "ödeyeceğini söyledi", "ödeme sözü verdi", "söz verdi", "taahhüt etti",
  "cuma gelecek", "hafta sonunda ödeyecek", "haber verecek", "geri dönecek",
  "düşüneceğini söyledi", "değerlendireceğini söyledi", "söz aldım",
  "vaatte bulundu", "bekliyor", "bekleyeceğiz", "bekliyoruz",
  "yarın ödeyecek", "pazartesi ödeyecek", "ödeme sözü aldım",
  "ödeyecekmiş", "ödeyeceğini belirtti",
  "ödeyecek dedi", "günü ödeyecek",
];

const FAILED_KW = [
  "olmadı", "reddetti", "red etti", "ulaşamadım", "bağlanamadım",
  "bulunamadı", "iptal oldu", "iptal etti", "hayır dedi", "ret aldım",
  "ödeme yapmayacak", "alamadım", "sonuç çıkmadı", "cevap vermedi",
  "erişemedim", "görüşemedim", "kapatıyor", "ödeyemeyeceğini söyledi",
  "ödeme yapamayacağını", "ödeme yapmayacağını",
];

const COMPLETION_KW = [
  "aradım", "görüştüm", "konuştum", "gönderdim", "ilettim",
  "tamamladım", "yaptım", "hallettim", "çözdüm", "ziyaret ettim",
  "toplantı yaptım", "buluştum", "mail attım", "mesaj attım", "yazdım",
  "takip ettim", "bilgilendirdim", "hatırlattım", "ilgilendim",
];

const MIN_CONFIDENCE = 0.60;

// ─── Public API ───────────────────────────────────────────────────────────────

export function detectExecutiveActionOutcomeSignals(input: {
  message: string;
  openActions: OpenActionInput[];
}): ExecutiveActionOutcomeSignal[] {
  if (input.openActions.length === 0) return [];

  const norm = normalize(input.message);

  const hasCompletion =
    hasAny(norm, SUCCESS_KW) ||
    hasAny(norm, PARTIAL_KW) ||
    hasAny(norm, FAILED_KW) ||
    hasAny(norm, COMPLETION_KW);
  if (!hasCompletion) return [];

  const outcomeStatus = resolveOutcome(norm);
  if (outcomeStatus === "PARTIAL") return [];

  const signals: ExecutiveActionOutcomeSignal[] = [];
  for (const action of input.openActions) {
    const { score, hasBracketMatch } = scoreActionMatch(norm, action);
    if (score <= 0) continue;

    const confidence = computeConfidence(outcomeStatus, score, hasBracketMatch);
    if (confidence < MIN_CONFIDENCE) continue;

    signals.push({
      actionId: action.id,
      actionTitle: action.title,
      outcomeStatus,
      resultSummary: input.message.slice(0, 300).trim(),
      confidence,
    });
  }

  // 2+ eşleşme → belirsiz, hiçbirini kapatma
  if (signals.length > 1) return [];

  return signals;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveOutcome(norm: string): ExecutiveActionOutcomeStatus {
  if (hasAny(norm, SUCCESS_KW)) return "SUCCESS";
  if (hasAny(norm, FAILED_KW)) return "FAILED";
  if (hasAny(norm, PARTIAL_KW)) return "PARTIAL";
  return "UNKNOWN";
}

function scoreActionMatch(
  norm: string,
  action: OpenActionInput,
): { score: number; hasBracketMatch: boolean } {
  // [ABC Müşterisi] formatından spesifik hedef adını çıkar
  const bracketMatch = action.title.match(/\[([^\]]+)\]/);
  if (bracketMatch) {
    const target = normalize(bracketMatch[1]);
    const tokens = target.split(/\s+/).filter((t) => t.length >= 3);
    if (tokens.length > 0) {
      const matched = tokens.filter((t) => norm.includes(t)).length;
      if (matched > 0) {
        return { score: matched / tokens.length, hasBracketMatch: true };
      }
    }
  }

  // Bracket yoksa: title + reason'dan anlamlı token çıkar
  const tokens = extractTokens(action.title + " " + action.reason);
  if (tokens.length === 0) return { score: 0, hasBracketMatch: false };

  const matched = tokens.filter((t) => norm.includes(t)).length;
  if (matched === 0) return { score: 0, hasBracketMatch: false };

  return {
    score: matched / Math.min(tokens.length, 4),
    hasBracketMatch: false,
  };
}

function computeConfidence(
  outcome: ExecutiveActionOutcomeStatus,
  matchScore: number,
  hasBracketMatch: boolean,
): number {
  const outcomeFactor =
    outcome === "SUCCESS" || outcome === "FAILED" ? 0.90
    : outcome === "PARTIAL" ? 0.80
    : 0.70;
  const adjustedMatch = hasBracketMatch ? Math.min(1.0, matchScore + 0.25) : matchScore;
  return outcomeFactor * adjustedMatch;
}

// Bracket içeriğini hariç tutarak title/reason'dan 5+ karakter token çıkar
function extractTokens(text: string): string[] {
  return normalize(text)
    .replace(/\[[^\]]*\]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 5);
}

function normalize(text: string): string {
  return text.toLocaleLowerCase("tr-TR").trim();
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}
