import type { CollectionActionContextItem } from "./collection-action-context-builder";
import type {
  CollectionActionLifecycleSignal,
  LifecycleSignalType,
} from "./collection-action-lifecycle.types";

// Turkish keyword sets ordered by specificity
const CONFIRMED_KEYWORDS = [
  "parayı gönderdi", "ödeme geldi", "havale geldi", "eft geldi",
  "para geldi", "ödeme aldım", "tahsil ettim", "tahsil edildi",
  "ödedi", "gönderdi", "yatırdı", "aktardı",
];

const DISMISSED_KEYWORDS = [
  "vazgeçtik", "takipten çıkar", "bıraktık", "olmayacak",
  "kapattık", "dosyayı kapat", "sonlandıralım", "iptal edelim",
];

const PAYMENT_INTENT_SUFFIXES = [
  "ödeyecek", "yatıracak", "gönderecek", "aktaracak", "havale yapacak",
];

const PROMISE_KEYWORDS = [
  "söz verdi", "taahhüt etti", "ödeme sözü verdi", "ödeyeceğini söyledi",
  "vaatte bulundu", "kabul etti",
];

const CONTACT_KEYWORDS = [
  "görüşüm yaptım", "iletişime geçtim", "görüştüm", "konuştum",
  "aradım", "ulaştım", "bağlandım", "buluştum",
];

const MONTH_MAP: Record<string, number> = {
  ocak: 0, şubat: 1, mart: 2, nisan: 3, mayıs: 4, haziran: 5,
  temmuz: 6, ağustos: 7, eylül: 8, ekim: 9, kasım: 10, aralık: 11,
};

// Confidence thresholds per signal type (checked in applier but defined here for reference)
export const SIGNAL_CONFIDENCE_THRESHOLDS: Record<LifecycleSignalType, number> = {
  STARTED_CONTACT: 0.70,
  PROMISED_PAYMENT: 0.65,
  PAYMENT_DATE_SET: 0.75,
  PAYMENT_CONFIRMED: 0.90,
  DISMISSED: 0.90,
};

// Status-transition signals require a single unambiguous match
const SINGLE_MATCH_REQUIRED: Set<LifecycleSignalType> = new Set([
  "STARTED_CONTACT",
  "PAYMENT_DATE_SET",
  "PAYMENT_CONFIRMED",
  "DISMISSED",
]);

export function detectCollectionActionSignals(input: {
  message: string;
  activeActions: CollectionActionContextItem[];
}): CollectionActionLifecycleSignal[] {
  if (input.activeActions.length === 0) return [];

  const normalized = input.message.toLowerCase();
  const now = new Date();

  const signalType = detectSignalType(normalized);
  if (!signalType) return [];

  const matches = findMatchingActions(normalized, input.activeActions);
  if (matches.length === 0) return [];

  // Safety rule: status-transition signals require exactly one matching action
  if (SINGLE_MATCH_REQUIRED.has(signalType) && matches.length > 1) {
    return [];
  }

  return matches.map(({ action, matchScore }) =>
    buildSignal({ signalType, action, confidence: computeConfidence(signalType, matchScore), message: normalized, now }),
  );
}

function detectSignalType(normalized: string): LifecycleSignalType | null {
  // Priority: most specific / highest stakes first
  if (hasAnyKeyword(normalized, CONFIRMED_KEYWORDS)) return "PAYMENT_CONFIRMED";
  if (hasAnyKeyword(normalized, DISMISSED_KEYWORDS)) return "DISMISSED";

  const parsedDate = parseExpectedDate(normalized, new Date());
  if (parsedDate && hasAnyKeyword(normalized, PAYMENT_INTENT_SUFFIXES)) return "PAYMENT_DATE_SET";

  if (hasAnyKeyword(normalized, PROMISE_KEYWORDS)) return "PROMISED_PAYMENT";
  if (hasAnyKeyword(normalized, CONTACT_KEYWORDS)) return "STARTED_CONTACT";

  return null;
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

function findMatchingActions(
  normalized: string,
  actions: CollectionActionContextItem[],
): { action: CollectionActionContextItem; matchScore: number }[] {
  const results: { action: CollectionActionContextItem; matchScore: number }[] = [];

  for (const action of actions) {
    const customerNormalized = action.customerName.toLowerCase().trim();
    // Require at least first+last name length to avoid false positives on short names
    if (customerNormalized.length < 4) continue;
    if (normalized.includes(customerNormalized)) {
      results.push({ action, matchScore: 1.0 });
    }
  }

  return results;
}

function computeConfidence(signalType: LifecycleSignalType, matchScore: number): number {
  const baseConfidence: Record<LifecycleSignalType, number> = {
    PAYMENT_CONFIRMED: 0.92,
    DISMISSED: 0.92,
    PAYMENT_DATE_SET: 0.80,
    PROMISED_PAYMENT: 0.72,
    STARTED_CONTACT: 0.78,
  };
  return baseConfidence[signalType] * matchScore;
}

function buildSignal(input: {
  signalType: LifecycleSignalType;
  action: CollectionActionContextItem;
  confidence: number;
  message: string;
  now: Date;
}): CollectionActionLifecycleSignal {
  const { signalType, action, confidence, message, now } = input;

  let proposedStatus = null;
  let proposedNote: string | null = null;
  let proposedExpectedDate: Date | null = null;
  let proposedLastContactAt: Date | null = null;

  switch (signalType) {
    case "STARTED_CONTACT":
      proposedStatus = "IN_PROGRESS" as const;
      proposedNote = "İletişime geçildi.";
      proposedLastContactAt = now;
      break;

    case "PROMISED_PAYMENT":
      proposedNote = "Ödeme sözü alındı.";
      proposedLastContactAt = now;
      break;

    case "PAYMENT_DATE_SET": {
      const date = parseExpectedDate(message, now);
      proposedExpectedDate = date;
      proposedNote = date
        ? `Beklenen ödeme tarihi: ${date.toISOString().slice(0, 10)}.`
        : "Ödeme tarihi belirsiz.";
      proposedLastContactAt = now;
      break;
    }

    case "PAYMENT_CONFIRMED":
      proposedStatus = "DONE" as const;
      proposedNote = "Ödeme onaylandı.";
      break;

    case "DISMISSED":
      proposedStatus = "DISMISSED" as const;
      proposedNote = "Takipten çıkarıldı.";
      break;
  }

  return {
    actionId: action.id,
    signalType,
    confidence,
    matchedCustomerName: action.customerName,
    currentStatus: action.status,
    proposedStatus,
    proposedNote,
    proposedExpectedDate,
    proposedLastContactAt,
  };
}

function parseExpectedDate(message: string, now: Date): Date | null {
  // "15 Haziran", "3 Temmuz" etc.
  const dateMatch = message.match(
    /(\d{1,2})\s*(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)/i,
  );
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const monthIndex = MONTH_MAP[dateMatch[2].toLowerCase()];
    if (monthIndex !== undefined && day >= 1 && day <= 31) {
      let year = now.getFullYear();
      let candidate = new Date(year, monthIndex, day);
      if (candidate <= now) {
        year++;
        candidate = new Date(year, monthIndex, day);
      }
      const diffDays = (candidate.getTime() - now.getTime()) / 86400000;
      if (diffDays <= 90) return candidate;
    }
  }

  if (/yarın/i.test(message)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }

  if (/bu\s+hafta\s+(içinde|içinde)?/i.test(message)) {
    const d = new Date(now);
    const daysToSunday = 7 - d.getDay();
    d.setDate(d.getDate() + daysToSunday);
    return d;
  }

  if (/gelecek\s+hafta|haftaya/i.test(message)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7 + (7 - d.getDay()));
    return d;
  }

  return null;
}
