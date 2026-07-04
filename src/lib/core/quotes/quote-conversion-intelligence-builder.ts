import type { QuoteConversionContext, QuoteConversionContextItem } from "./quote-conversion-context-builder";
import type { QuoteEventSummary } from "./quote-event.types";
import type { QuoteEventType } from "@prisma/client";

const MIN_SAMPLE_SIZE = 5;
const HIGH_VALUE_THRESHOLD = 50000;
const HIGH_FOLLOWUP_COUNT = 2;
const HIGH_REVISION_COUNT = 2;
const MIN_BEHAVIORAL_SAMPLE = 2;
const MIN_BEHAVIORAL_SAMPLE_MEDIUM = 3;
const DOMINANT_PATTERN_THRESHOLD = 0.3;

export type DominantLossPattern =
  | "NEVER_VIEWED"
  | "VIEWED_NO_FOLLOWUP"
  | "REVISION_OVERLOAD"
  | "UNKNOWN";

export type QuoteConversionCustomerPattern = {
  customerName: string;
  wonCount: number;
  lostCount: number;
};

export type QuoteConversionIntelligence = {
  totalClosed: number;
  wonCount: number;
  lostCount: number;
  cancelledCount: number;
  winRate: number;

  totalWonValue: number;
  averageWonValue: number | null;
  averageLostValue: number | null;
  highValueWinRate: number | null;

  averageDaysToWin: number | null;
  averageDaysToLose: number | null;

  viewedWinRate: number | null;
  neverViewedLossRate: number | null;
  negotiationWinRate: number | null;
  highFollowUpWinRate: number | null;
  revisionLossRate: number | null;

  repeatingCustomers: QuoteConversionCustomerPattern[];
  dominantLossPattern: DominantLossPattern;

  conversionInsights: string[];
  strategicRecommendations: string[];

  hasEnoughData: boolean;
  lookbackDays: number;
};

export function buildQuoteConversionIntelligence(
  context: QuoteConversionContext,
): QuoteConversionIntelligence {
  const { items, lookbackDays } = context;
  const hasEnoughData = items.length >= MIN_SAMPLE_SIZE;

  const wonItems = items.filter((i) => i.finalStatus === "WON");
  const lostItems = items.filter((i) => i.finalStatus === "LOST");
  const cancelledItems = items.filter((i) => i.finalStatus === "CANCELLED");

  const wonCount = wonItems.length;
  const lostCount = lostItems.length;
  const cancelledCount = cancelledItems.length;
  const totalClosed = items.length;

  const decidedCount = wonCount + lostCount;
  const winRate = decidedCount > 0 ? wonCount / decidedCount : 0;

  const totalWonValue = wonItems.reduce((s, i) => s + i.amount, 0);
  const averageWonValue = wonCount > 0 ? totalWonValue / wonCount : null;
  const averageLostValue =
    lostCount > 0 ? lostItems.reduce((s, i) => s + i.amount, 0) / lostCount : null;

  const highValueDecided = items.filter(
    (i) =>
      i.amount >= HIGH_VALUE_THRESHOLD && (i.finalStatus === "WON" || i.finalStatus === "LOST"),
  );
  const highValueWon = highValueDecided.filter((i) => i.finalStatus === "WON").length;
  const highValueWinRate =
    highValueDecided.length >= MIN_BEHAVIORAL_SAMPLE_MEDIUM
      ? highValueWon / highValueDecided.length
      : null;

  const averageDaysToWin = computeAverageDays(wonItems, (i) => {
    if (!i.sentAt || !i.wonAt) return null;
    return daysBetween(i.sentAt, i.wonAt);
  });

  const averageDaysToLose = computeAverageDays(lostItems, (i) => {
    if (!i.sentAt || !i.lostAt) return null;
    return daysBetween(i.sentAt, i.lostAt);
  });

  const viewedDecided = items.filter(
    (i) => i.viewedAt !== null && (i.finalStatus === "WON" || i.finalStatus === "LOST"),
  );
  const viewedWon = viewedDecided.filter((i) => i.finalStatus === "WON").length;
  const viewedWinRate =
    viewedDecided.length >= MIN_BEHAVIORAL_SAMPLE_MEDIUM
      ? viewedWon / viewedDecided.length
      : null;

  const neverViewedLost = lostItems.filter((i) => i.viewedAt === null).length;
  const neverViewedLossRate = lostCount > 0 ? neverViewedLost / lostCount : null;

  const negotiatedItems = items.filter(
    (i) =>
      (i.finalStatus === "WON" || i.finalStatus === "LOST") &&
      i.events.some((e) => e.eventType === "QUOTE_NEGOTIATION_STARTED"),
  );
  const negotiatedWon = negotiatedItems.filter((i) => i.finalStatus === "WON").length;
  const negotiationWinRate =
    negotiatedItems.length >= MIN_BEHAVIORAL_SAMPLE
      ? negotiatedWon / negotiatedItems.length
      : null;

  const highFollowUpItems = items.filter(
    (i) =>
      (i.finalStatus === "WON" || i.finalStatus === "LOST") &&
      countEventType(i.events, "QUOTE_FOLLOWED_UP") >= HIGH_FOLLOWUP_COUNT,
  );
  const highFollowUpWon = highFollowUpItems.filter((i) => i.finalStatus === "WON").length;
  const highFollowUpWinRate =
    highFollowUpItems.length >= MIN_BEHAVIORAL_SAMPLE
      ? highFollowUpWon / highFollowUpItems.length
      : null;

  const highRevisionItems = items.filter(
    (i) =>
      (i.finalStatus === "WON" || i.finalStatus === "LOST") &&
      countEventType(i.events, "QUOTE_REVISION_REQUESTED") >= HIGH_REVISION_COUNT,
  );
  const highRevisionLost = highRevisionItems.filter((i) => i.finalStatus === "LOST").length;
  const revisionLossRate =
    highRevisionItems.length >= MIN_BEHAVIORAL_SAMPLE
      ? highRevisionLost / highRevisionItems.length
      : null;

  const repeatingCustomers = buildRepeatingCustomers(items);
  const dominantLossPattern = computeDominantLossPattern(lostItems);

  const conversionInsights = buildConversionInsights({
    wonCount,
    lostCount,
    winRate,
    averageWonValue,
    averageLostValue,
    viewedWinRate,
    neverViewedLossRate,
    negotiationWinRate,
    highValueWinRate,
    hasEnoughData,
    lookbackDays,
  });

  const strategicRecommendations = buildStrategicRecommendations({
    dominantLossPattern,
    highFollowUpWinRate,
    revisionLossRate,
    winRate,
    hasEnoughData,
  });

  return {
    totalClosed,
    wonCount,
    lostCount,
    cancelledCount,
    winRate,
    totalWonValue,
    averageWonValue,
    averageLostValue,
    highValueWinRate,
    averageDaysToWin,
    averageDaysToLose,
    viewedWinRate,
    neverViewedLossRate,
    negotiationWinRate,
    highFollowUpWinRate,
    revisionLossRate,
    repeatingCustomers,
    dominantLossPattern,
    conversionInsights,
    strategicRecommendations,
    hasEnoughData,
    lookbackDays,
  };
}

function computeDominantLossPattern(
  lostItems: QuoteConversionContextItem[],
): DominantLossPattern {
  if (lostItems.length === 0) return "UNKNOWN";

  const total = lostItems.length;
  const neverViewed = lostItems.filter((i) => i.viewedAt === null).length;
  const viewedNoFollowup = lostItems.filter(
    (i) => i.viewedAt !== null && countEventType(i.events, "QUOTE_FOLLOWED_UP") === 0,
  ).length;
  const revisionOverload = lostItems.filter(
    (i) => countEventType(i.events, "QUOTE_REVISION_REQUESTED") >= HIGH_REVISION_COUNT,
  ).length;

  const neverViewedRate = neverViewed / total;
  const viewedNoFollowupRate = viewedNoFollowup / total;
  const revisionOverloadRate = revisionOverload / total;

  if (
    neverViewedRate >= DOMINANT_PATTERN_THRESHOLD &&
    neverViewedRate >= viewedNoFollowupRate &&
    neverViewedRate >= revisionOverloadRate
  ) {
    return "NEVER_VIEWED";
  }
  if (
    viewedNoFollowupRate >= DOMINANT_PATTERN_THRESHOLD &&
    viewedNoFollowupRate >= neverViewedRate &&
    viewedNoFollowupRate >= revisionOverloadRate
  ) {
    return "VIEWED_NO_FOLLOWUP";
  }
  if (revisionOverloadRate >= DOMINANT_PATTERN_THRESHOLD) {
    return "REVISION_OVERLOAD";
  }
  return "UNKNOWN";
}

function buildRepeatingCustomers(
  items: QuoteConversionContextItem[],
): QuoteConversionCustomerPattern[] {
  const map = new Map<string, { wonCount: number; lostCount: number }>();

  for (const item of items) {
    if (item.finalStatus === "CANCELLED") continue;
    const current = map.get(item.customerName) ?? { wonCount: 0, lostCount: 0 };
    if (item.finalStatus === "WON") {
      map.set(item.customerName, { ...current, wonCount: current.wonCount + 1 });
    } else {
      map.set(item.customerName, { ...current, lostCount: current.lostCount + 1 });
    }
  }

  return [...map.entries()]
    .filter(([, v]) => v.wonCount + v.lostCount >= 2)
    .map(([customerName, v]) => ({ customerName, wonCount: v.wonCount, lostCount: v.lostCount }))
    .sort((a, b) => b.wonCount + b.lostCount - (a.wonCount + a.lostCount))
    .slice(0, 5);
}

function buildConversionInsights(input: {
  wonCount: number;
  lostCount: number;
  winRate: number;
  averageWonValue: number | null;
  averageLostValue: number | null;
  viewedWinRate: number | null;
  neverViewedLossRate: number | null;
  negotiationWinRate: number | null;
  highValueWinRate: number | null;
  hasEnoughData: boolean;
  lookbackDays: number;
}): string[] {
  if (!input.hasEnoughData) return [];

  const {
    wonCount,
    lostCount,
    winRate,
    averageWonValue,
    averageLostValue,
    viewedWinRate,
    neverViewedLossRate,
    negotiationWinRate,
    highValueWinRate,
    lookbackDays,
  } = input;

  const insights: string[] = [];
  const decidedCount = wonCount + lostCount;

  insights.push(
    `Son ${lookbackDays} günde ${decidedCount} karara bağlanan tekliften ${wonCount}'i kazanıldı — kazanma oranı %${Math.round(winRate * 100)}.`,
  );

  if (averageWonValue !== null && averageLostValue !== null) {
    const note =
      averageWonValue > averageLostValue
        ? "kazanılan tekliflerin tutarı daha yüksek"
        : "yüksek tutarlı tekliflerde kapanış riski var";
    insights.push(
      `Kazanılan tekliflerin ortalaması ${formatTRY(averageWonValue)}, kaybedilenlerin ${formatTRY(averageLostValue)} — ${note}.`,
    );
  }

  if (neverViewedLossRate !== null && neverViewedLossRate >= 0.4) {
    insights.push(
      `Kaybedilen tekliflerin %${Math.round(neverViewedLossRate * 100)}'i hiç görüntülenmedi — açılmayan teklif en büyük kör nokta.`,
    );
  } else if (viewedWinRate !== null) {
    insights.push(
      `Görüntülenen tekliflerde kazanma oranı %${Math.round(viewedWinRate * 100)} — teklif açılımı güçlü bir dönüşüm sinyali.`,
    );
  }

  if (negotiationWinRate !== null) {
    insights.push(
      `Müzakereye giren tekliflerin %${Math.round(negotiationWinRate * 100)}'i kazanıldı — müzakereye ulaşmak kapanışı ciddi ölçüde artırıyor.`,
    );
  } else if (highValueWinRate !== null) {
    insights.push(
      `₺${HIGH_VALUE_THRESHOLD.toLocaleString("tr-TR")}+ tekliflerde kazanma oranı %${Math.round(highValueWinRate * 100)}.`,
    );
  }

  return insights.slice(0, 4);
}

function buildStrategicRecommendations(input: {
  dominantLossPattern: DominantLossPattern;
  highFollowUpWinRate: number | null;
  revisionLossRate: number | null;
  winRate: number;
  hasEnoughData: boolean;
}): string[] {
  if (!input.hasEnoughData) return [];

  const { dominantLossPattern, highFollowUpWinRate, revisionLossRate, winRate } = input;
  const recs: string[] = [];

  if (dominantLossPattern === "NEVER_VIEWED") {
    recs.push(
      "Teklifler gönderildikten sonra açılmıyor. Gönderim sonrası 24-48 saat içinde sms veya telefon ile müşteriyle temasa geç.",
    );
  } else if (dominantLossPattern === "VIEWED_NO_FOLLOWUP") {
    recs.push(
      "Teklifler görüntüleniyor ama takip yapılmıyor. Görüntüleme sonrası 3-5 gün içinde sistematik takip başlat — bu en kritik aksiyon noktası.",
    );
  } else if (dominantLossPattern === "REVISION_OVERLOAD") {
    recs.push(
      "Teklifler revizyon döngüsüne giriyor ve kaybediliyor. İlk görüşmede bütçe ve kapsamı netleştir; revizyon sayısını kısıt.",
    );
  }

  if (highFollowUpWinRate !== null && highFollowUpWinRate >= 0.5) {
    recs.push(
      `2+ takip yapılan tekliflerde kazanma oranı %${Math.round(highFollowUpWinRate * 100)} — düzenli takip doğrudan kazanma oranını artırıyor.`,
    );
  }

  if (revisionLossRate !== null && revisionLossRate >= 0.6) {
    recs.push(
      `2+ revizyon istenen tekliflerin %${Math.round(revisionLossRate * 100)}'i kaybediliyor — fazla revizyon fiyat direncinin işareti, erken müzakereye geç.`,
    );
  }

  if (recs.length === 0 && winRate < 0.4) {
    recs.push(
      `Genel kazanma oranı %${Math.round(winRate * 100)} — teklif sunumu, fiyatlama ve takip süreçlerini gözden geçir.`,
    );
  }

  return recs.slice(0, 3);
}

function computeAverageDays(
  items: QuoteConversionContextItem[],
  getDays: (item: QuoteConversionContextItem) => number | null,
): number | null {
  const values = items.map(getDays).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

function countEventType(events: QuoteEventSummary[], eventType: QuoteEventType): number {
  return events.filter((e) => e.eventType === eventType).length;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

function formatTRY(amount: number): string {
  return `₺${amount.toLocaleString("tr-TR")}`;
}
