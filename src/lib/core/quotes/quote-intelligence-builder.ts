import type { QuoteContext, QuoteContextActiveItem } from "./quote-context-builder";
import { buildQuoteTimelineIntelligence, type QuoteTimelineIntelligence } from "./quote-timeline-intelligence-builder";
import { buildQuoteConversionIntelligence, type QuoteConversionIntelligence } from "./quote-conversion-intelligence-builder";
import type { QuoteConversionContext } from "./quote-conversion-context-builder";

export type QuoteRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type QuoteIntelligencePriorityItem = {
  customerName: string;
  title: string;
  amount: number;
  reason: string;
};

export type QuoteIntelligence = {
  quoteRiskLevel: QuoteRiskLevel;
  activeQuoteCount: number;
  totalOpenQuoteValue: number;
  hotQuoteCount: number;
  staleQuoteCount: number;
  topQuotePriority: QuoteIntelligencePriorityItem | null;
  quotePipelineSummary: string;
  quoteInsights: string[];
  nextBestActions: string[];
  executiveSummary: string;
  hasActiveOpportunity: boolean;
  timelineIntelligence: QuoteTimelineIntelligence | null;
  conversionIntelligence: QuoteConversionIntelligence | null;
};

const STALE_SENT_DAYS = 14;
const STALE_ACTIVE_DAYS = 30;
const STALE_DRAFT_DAYS = 7;
const FRESH_SENT_DAYS = 3;
const HIGH_RISK_STALE_COUNT = 3;
const MEDIUM_RISK_STALE_COUNT = 1;

export function buildQuoteIntelligence(
  context: QuoteContext,
  conversionContext?: QuoteConversionContext | null,
): QuoteIntelligence {
  const now = new Date();
  const { activeItems, openCount, openTotal, lastWon } = context;

  const hotItems = activeItems.filter((q) => isHot(q, now));
  const staleItems = activeItems.filter((q) => isStale(q, now));
  const hotQuoteCount = hotItems.length;
  const staleQuoteCount = staleItems.length;

  const quoteRiskLevel = computeQuoteRiskLevel({ staleItems, activeItems, now });
  const topQuotePriority = buildTopPriority(activeItems, now);
  const quoteInsights = buildQuoteInsights({ activeItems, hotItems, staleItems, lastWon, now });
  const nextBestActions = buildNextBestActions({ activeItems, hotItems, staleItems, now });
  const quotePipelineSummary = buildPipelineSummary({ openCount, openTotal, hotQuoteCount, staleQuoteCount });
  const executiveSummary = buildExecutiveSummary({
    quoteRiskLevel,
    openCount,
    openTotal,
    hotQuoteCount,
    staleQuoteCount,
    topQuotePriority,
  });

  const hasActiveOpportunity = hotQuoteCount > 0 || (openCount > 0 && staleQuoteCount < openCount);
  const timelineIntelligence = activeItems.length > 0 ? buildQuoteTimelineIntelligence(activeItems) : null;
  const conversionIntelligence = conversionContext
    ? buildQuoteConversionIntelligence(conversionContext)
    : null;

  return {
    quoteRiskLevel,
    activeQuoteCount: openCount,
    totalOpenQuoteValue: openTotal,
    hotQuoteCount,
    staleQuoteCount,
    topQuotePriority,
    quotePipelineSummary,
    quoteInsights,
    nextBestActions,
    executiveSummary,
    hasActiveOpportunity,
    timelineIntelligence,
    conversionIntelligence,
  };
}

function isHot(q: QuoteContextActiveItem, now: Date): boolean {
  if (q.status === "NEGOTIATION") return true;
  if (q.status === "VIEWED") return true;
  if (q.status === "SENT" && q.viewedAt !== null) return true;
  if (q.status === "SENT" && q.sentAt !== null && daysSince(q.sentAt, now) <= FRESH_SENT_DAYS) return true;
  return false;
}

function isStale(q: QuoteContextActiveItem, now: Date): boolean {
  if (q.status === "DRAFT") {
    return daysSince(q.createdAt, now) >= STALE_DRAFT_DAYS;
  }
  if (q.status === "SENT") {
    if (q.sentAt !== null && q.viewedAt === null && daysSince(q.sentAt, now) >= STALE_SENT_DAYS) return true;
    if (daysSince(q.updatedAt, now) >= STALE_ACTIVE_DAYS) return true;
  }
  if (q.status === "VIEWED" || q.status === "NEGOTIATION") {
    return daysSince(q.updatedAt, now) >= STALE_ACTIVE_DAYS;
  }
  return false;
}

function daysSince(date: Date, now: Date): number {
  return Math.floor((now.getTime() - date.getTime()) / 86400000);
}

function computeQuoteRiskLevel(input: {
  staleItems: QuoteContextActiveItem[];
  activeItems: QuoteContextActiveItem[];
  now: Date;
}): QuoteRiskLevel {
  const { staleItems, activeItems } = input;

  if (activeItems.length === 0) return "LOW";

  const staleCount = staleItems.length;
  const highValueStale = staleItems.filter((q) => q.amount >= 50000);
  const sentNotViewed = staleItems.filter(
    (q) => q.status === "SENT" && q.viewedAt === null && q.sentAt !== null && daysSince(q.sentAt, input.now) >= STALE_SENT_DAYS,
  );

  if (highValueStale.length >= 2 || (highValueStale.length >= 1 && sentNotViewed.length >= 1)) {
    return "CRITICAL";
  }
  if (staleCount >= HIGH_RISK_STALE_COUNT || highValueStale.length >= 1) {
    return "HIGH";
  }
  if (staleCount >= MEDIUM_RISK_STALE_COUNT) {
    return "MEDIUM";
  }
  return "LOW";
}

function priorityScore(q: QuoteContextActiveItem, now: Date): number {
  const statusWeight: Record<string, number> = {
    NEGOTIATION: 1.5,
    VIEWED: 1.3,
    SENT: 1.0,
    DRAFT: 0.5,
  };
  const weight = statusWeight[q.status] ?? 1.0;
  const ageBonus = isStale(q, now) ? 0.3 : 0;
  return q.amount * (weight + ageBonus);
}

function buildTopPriority(
  items: QuoteContextActiveItem[],
  now: Date,
): QuoteIntelligencePriorityItem | null {
  if (items.length === 0) return null;

  const sorted = [...items].sort((a, b) => priorityScore(b, now) - priorityScore(a, now));
  const top = sorted[0];

  let reason = "Yüksek değerli teklif";
  if (top.status === "NEGOTIATION") reason = "Müzakere aşamasında — kapatma fırsatı";
  else if (top.status === "VIEWED" || (top.status === "SENT" && top.viewedAt !== null))
    reason = "Müşteri görüntüledi — takip zamanı";
  else if (top.status === "SENT" && top.sentAt !== null && top.viewedAt === null)
    reason = `Gönderildi ama açılmadı (${daysSince(top.sentAt, now)} gün)`;
  else if (top.status === "DRAFT") reason = "Taslak bekliyor — göndermek için hazır mı?";

  return { customerName: top.customerName, title: top.title, amount: top.amount, reason };
}

function buildQuoteInsights(input: {
  activeItems: QuoteContextActiveItem[];
  hotItems: QuoteContextActiveItem[];
  staleItems: QuoteContextActiveItem[];
  lastWon: { customerName: string; title: string; amount: number } | null;
  now: Date;
}): string[] {
  const { activeItems, hotItems, staleItems, lastWon, now } = input;
  const insights: string[] = [];

  if (hotItems.length > 0) {
    const names = hotItems.map((q) => q.customerName).join(", ");
    insights.push(`${hotItems.length} sıcak teklif var: ${names}.`);
  }

  const negotiating = activeItems.filter((q) => q.status === "NEGOTIATION");
  if (negotiating.length > 0) {
    const total = negotiating.reduce((s, q) => s + q.amount, 0);
    insights.push(`${negotiating.length} teklif müzakere aşamasında — ${formatTRY(total)} kapanış potansiyeli.`);
  }

  const sentNotViewed = staleItems.filter(
    (q) => q.status === "SENT" && q.viewedAt === null && q.sentAt !== null,
  );
  if (sentNotViewed.length > 0) {
    const oldest = [...sentNotViewed].sort(
      (a, b) => daysSince(b.sentAt!, now) - daysSince(a.sentAt!, now),
    )[0];
    insights.push(
      `${sentNotViewed.length} teklif gönderildi ama müşteri tarafından açılmadı — en eskisi ${oldest.customerName} (${daysSince(oldest.sentAt!, now)} gün önce).`,
    );
  }

  const staleDrafts = staleItems.filter((q) => q.status === "DRAFT");
  if (staleDrafts.length > 0) {
    insights.push(`${staleDrafts.length} taslak teklif ${STALE_DRAFT_DAYS}+ gündür bekliyor — gönderilmeden bekliyor.`);
  }

  if (lastWon) {
    insights.push(`Son kazanılan teklif: ${lastWon.customerName} — ${formatTRY(lastWon.amount)}.`);
  }

  return insights.slice(0, 4);
}

function buildNextBestActions(input: {
  activeItems: QuoteContextActiveItem[];
  hotItems: QuoteContextActiveItem[];
  staleItems: QuoteContextActiveItem[];
  now: Date;
}): string[] {
  const { hotItems, staleItems, now } = input;
  const actions: string[] = [];

  const negotiating = hotItems.filter((q) => q.status === "NEGOTIATION");
  for (const q of negotiating.slice(0, 2)) {
    actions.push(
      `${q.customerName} — ${q.title} (${formatTRY(q.amount)}) müzakerede: bu hafta kapanış için net adım at.`,
    );
  }

  const viewedNotNegotiating = hotItems.filter(
    (q) => q.status === "VIEWED" || (q.status === "SENT" && q.viewedAt !== null),
  );
  for (const q of viewedNotNegotiating.slice(0, 2)) {
    actions.push(
      `${q.customerName} teklifi görüntüledi — takip mesajı veya çağrı planla (${formatTRY(q.amount)}).`,
    );
  }

  const sentNotViewed = staleItems.filter(
    (q) => q.status === "SENT" && q.viewedAt === null && q.sentAt !== null,
  );
  for (const q of sentNotViewed.slice(0, 2)) {
    actions.push(
      `${q.customerName} — ${q.title}: ${daysSince(q.sentAt!, now)} gündür açmadı, farklı kanaldan eriş (${formatTRY(q.amount)}).`,
    );
  }

  const staleDrafts = staleItems.filter((q) => q.status === "DRAFT");
  if (staleDrafts.length > 0) {
    const top = staleDrafts[0];
    actions.push(
      `${top.customerName} için bekleyen taslak teklifi gözden geçir ve gönder — ${formatTRY(top.amount)}.`,
    );
  }

  return actions.slice(0, 4);
}

function buildPipelineSummary(input: {
  openCount: number;
  openTotal: number;
  hotQuoteCount: number;
  staleQuoteCount: number;
}): string {
  const { openCount, openTotal, hotQuoteCount, staleQuoteCount } = input;

  if (openCount === 0) return "Aktif teklif pipeline'ı boş.";

  const parts: string[] = [];
  parts.push(`${openCount} aktif teklif, toplam ${formatTRY(openTotal)}.`);
  if (hotQuoteCount > 0) parts.push(`${hotQuoteCount} sıcak.`);
  if (staleQuoteCount > 0) parts.push(`${staleQuoteCount} takip bekliyor.`);
  return parts.join(" ");
}

function buildExecutiveSummary(input: {
  quoteRiskLevel: QuoteRiskLevel;
  openCount: number;
  openTotal: number;
  hotQuoteCount: number;
  staleQuoteCount: number;
  topQuotePriority: QuoteIntelligencePriorityItem | null;
}): string {
  const { quoteRiskLevel, openCount, openTotal, hotQuoteCount, staleQuoteCount, topQuotePriority } = input;

  if (openCount === 0) return "Açık teklif bulunmuyor.";

  const riskLabel: Record<QuoteRiskLevel, string> = {
    LOW: "düşük",
    MEDIUM: "orta",
    HIGH: "yüksek",
    CRITICAL: "kritik",
  };

  const parts: string[] = [];

  if (hotQuoteCount > 0 && staleQuoteCount === 0) {
    parts.push(
      `Teklif pipeline'ı aktif: ${openCount} teklif, ${formatTRY(openTotal)} — ${hotQuoteCount} tanesi sıcak, risk ${riskLabel[quoteRiskLevel]}.`,
    );
  } else if (staleQuoteCount >= openCount) {
    parts.push(
      `Pipeline durgun: ${openCount} teklifin tamamı takip bekliyor — risk ${riskLabel[quoteRiskLevel].toUpperCase()}.`,
    );
  } else {
    parts.push(
      `${openCount} aktif teklif, ${formatTRY(openTotal)} — ${staleQuoteCount} takip gerektiriyor, risk ${riskLabel[quoteRiskLevel]}.`,
    );
  }

  if (topQuotePriority) {
    parts.push(`Öncelik: ${topQuotePriority.customerName} — ${topQuotePriority.reason}.`);
  }

  return parts.join(" ");
}

function formatTRY(amount: number): string {
  return `₺${amount.toLocaleString("tr-TR")}`;
}
