import type { QuoteContextActiveItem } from "./quote-context-builder";
import type { QuoteEventSummary } from "./quote-event.types";
import type { QuoteEventType, QuoteStatus } from "@prisma/client";

export type WinProbabilitySignal = "HIGH" | "MEDIUM" | "LOW" | "ABANDON_RISK";

export type QuoteTimelineItem = {
  quoteId: string;
  customerName: string;
  title: string;
  amount: number;
  status: QuoteStatus;
  daysSinceLastContact: number | null;
  hasMissingFollowUp: boolean;
  followUpCount: number;
  revisionCount: number;
  isRevisionRisk: boolean;
  engagementSpeed: number | null;
  isEngaged: boolean;
  winProbabilitySignal: WinProbabilitySignal;
  lastActivityEvent: QuoteEventType | null;
  lastActivityDate: Date | null;
};

export type QuoteTimelineIntelligence = {
  items: QuoteTimelineItem[];
  missingFollowUpCount: number;
  revisionRiskCount: number;
  highEngagementCount: number;
  abandonRiskCount: number;
  staleFalsePositiveCount: number;
  timelineInsights: string[];
  followUpRecommendations: string[];
};

const MISSING_FOLLOWUP_DAYS = 7;
const ABANDON_RISK_DAYS = 21;
const FAST_ENGAGEMENT_DAYS = 3;
const REVISION_RISK_COUNT = 2;
const STALE_THRESHOLD_DAYS = 14;

const CONTACT_EVENT_TYPES: QuoteEventType[] = [
  "QUOTE_SENT",
  "QUOTE_FOLLOWED_UP",
  "QUOTE_NEGOTIATION_STARTED",
  "QUOTE_REVISION_REQUESTED",
];

const ACTIVITY_EVENT_TYPES: QuoteEventType[] = [
  "QUOTE_SENT",
  "QUOTE_VIEWED",
  "QUOTE_FOLLOWED_UP",
  "QUOTE_NEGOTIATION_STARTED",
  "QUOTE_REVISION_REQUESTED",
  "QUOTE_WON",
  "QUOTE_LOST",
  "QUOTE_CANCELLED",
];

export function buildQuoteTimelineIntelligence(
  activeItems: QuoteContextActiveItem[],
): QuoteTimelineIntelligence {
  const now = new Date();

  if (activeItems.length === 0) {
    return emptyIntelligence();
  }

  const items = activeItems.map((item) => buildTimelineItem(item, now));

  const missingFollowUpCount = items.filter((i) => i.hasMissingFollowUp).length;
  const revisionRiskCount = items.filter((i) => i.isRevisionRisk).length;
  const highEngagementCount = items.filter((i) => i.isEngaged).length;
  const abandonRiskCount = items.filter((i) => i.winProbabilitySignal === "ABANDON_RISK").length;
  const staleFalsePositiveCount = items.filter((i) => isStaleFalsePositive(i, now)).length;

  const timelineInsights = buildTimelineInsights({
    items,
    missingFollowUpCount,
    revisionRiskCount,
    highEngagementCount,
    abandonRiskCount,
    now,
  });

  const followUpRecommendations = buildFollowUpRecommendations(items, now);

  return {
    items,
    missingFollowUpCount,
    revisionRiskCount,
    highEngagementCount,
    abandonRiskCount,
    staleFalsePositiveCount,
    timelineInsights,
    followUpRecommendations,
  };
}

function buildTimelineItem(item: QuoteContextActiveItem, now: Date): QuoteTimelineItem {
  const events = item.events ?? [];

  const followUpCount = countEventType(events, "QUOTE_FOLLOWED_UP");
  const revisionCount = countEventType(events, "QUOTE_REVISION_REQUESTED");
  const isRevisionRisk = revisionCount >= REVISION_RISK_COUNT;

  const lastContactEvent = findLastEventOfTypes(events, CONTACT_EVENT_TYPES);
  const daysSinceLastContact = lastContactEvent
    ? daysSince(lastContactEvent.createdAt, now)
    : null;

  const hasMissingFollowUp = computeMissingFollowUp(item, events, now);

  const sentEvent = findFirstEventOfType(events, "QUOTE_SENT");
  const viewedEvent = findFirstEventOfType(events, "QUOTE_VIEWED");
  const engagementSpeed =
    sentEvent && viewedEvent
      ? daysSince(sentEvent.createdAt, viewedEvent.createdAt)
      : null;

  const isEngaged = computeIsEngaged(item, engagementSpeed);

  const winProbabilitySignal = computeWinProbability({
    item,
    events,
    engagementSpeed,
    daysSinceLastContact,
    now,
  });

  const lastActivityEvent = findLastEventOfTypes(events, ACTIVITY_EVENT_TYPES);

  return {
    quoteId: item.id,
    customerName: item.customerName,
    title: item.title,
    amount: item.amount,
    status: item.status,
    daysSinceLastContact,
    hasMissingFollowUp,
    followUpCount,
    revisionCount,
    isRevisionRisk,
    engagementSpeed,
    isEngaged,
    winProbabilitySignal,
    lastActivityEvent: lastActivityEvent?.eventType ?? null,
    lastActivityDate: lastActivityEvent?.createdAt ?? null,
  };
}

function computeMissingFollowUp(
  item: QuoteContextActiveItem,
  events: QuoteEventSummary[],
  now: Date,
): boolean {
  if (item.status === "DRAFT" || item.status === "WON" || item.status === "LOST" || item.status === "CANCELLED") {
    return false;
  }
  if (events.length === 0) {
    const sentAgo = item.sentAt ? daysSince(item.sentAt, now) : null;
    return sentAgo !== null && sentAgo >= MISSING_FOLLOWUP_DAYS;
  }
  const hasView = events.some((e) => e.eventType === "QUOTE_VIEWED");
  if (!hasView) return false;

  const lastFollowUp = findLastEventOfType(events, "QUOTE_FOLLOWED_UP");
  const viewedEvent = findFirstEventOfType(events, "QUOTE_VIEWED");
  const referenceDate = lastFollowUp?.createdAt ?? viewedEvent?.createdAt;
  return referenceDate !== undefined && daysSince(referenceDate, now) >= MISSING_FOLLOWUP_DAYS;
}

function computeIsEngaged(
  item: QuoteContextActiveItem,
  engagementSpeed: number | null,
): boolean {
  if (item.status === "NEGOTIATION") return true;
  if (item.status === "VIEWED") return true;
  if (engagementSpeed !== null && engagementSpeed <= FAST_ENGAGEMENT_DAYS) return true;
  return false;
}

function computeWinProbability(input: {
  item: QuoteContextActiveItem;
  events: QuoteEventSummary[];
  engagementSpeed: number | null;
  daysSinceLastContact: number | null;
  now: Date;
}): WinProbabilitySignal {
  const { item, events, engagementSpeed, daysSinceLastContact, now } = input;

  if (item.status === "NEGOTIATION") {
    if (daysSinceLastContact !== null && daysSinceLastContact <= 7) return "HIGH";
    return "MEDIUM";
  }

  if (item.status === "VIEWED") {
    const revisionCount = countEventType(events, "QUOTE_REVISION_REQUESTED");
    if (revisionCount >= REVISION_RISK_COUNT) return "LOW";
    return "MEDIUM";
  }

  if (item.status === "SENT") {
    const sentAgo = item.sentAt ? daysSince(item.sentAt, now) : null;

    if (sentAgo !== null && sentAgo >= ABANDON_RISK_DAYS && daysSinceLastContact === null) {
      return "ABANDON_RISK";
    }
    if (sentAgo !== null && sentAgo >= STALE_THRESHOLD_DAYS && item.viewedAt === null) {
      return "LOW";
    }
    if (engagementSpeed !== null && engagementSpeed <= FAST_ENGAGEMENT_DAYS) return "HIGH";
    return "MEDIUM";
  }

  return "LOW";
}

function buildTimelineInsights(input: {
  items: QuoteTimelineItem[];
  missingFollowUpCount: number;
  revisionRiskCount: number;
  highEngagementCount: number;
  abandonRiskCount: number;
  now: Date;
}): string[] {
  const { items, missingFollowUpCount, revisionRiskCount, highEngagementCount, abandonRiskCount } = input;
  const insights: string[] = [];

  if (highEngagementCount > 0) {
    const names = items
      .filter((i) => i.isEngaged)
      .map((i) => i.customerName)
      .join(", ");
    insights.push(`${highEngagementCount} müşteri aktif sinyal veriyor: ${names}.`);
  }

  if (missingFollowUpCount > 0) {
    const names = items
      .filter((i) => i.hasMissingFollowUp)
      .map((i) => i.customerName)
      .join(", ");
    insights.push(`${missingFollowUpCount} teklifte ${MISSING_FOLLOWUP_DAYS}+ gündür takip yapılmadı: ${names}.`);
  }

  if (revisionRiskCount > 0) {
    const names = items
      .filter((i) => i.isRevisionRisk)
      .map((i) => `${i.customerName} (${i.revisionCount} revizyon)`)
      .join(", ");
    insights.push(`${revisionRiskCount} teklifte yüksek revizyon riski: ${names}.`);
  }

  if (abandonRiskCount > 0) {
    const names = items
      .filter((i) => i.winProbabilitySignal === "ABANDON_RISK")
      .map((i) => i.customerName)
      .join(", ");
    insights.push(`${abandonRiskCount} teklif kaybolma riskinde — ${ABANDON_RISK_DAYS}+ gündür hiç hareket yok: ${names}.`);
  }

  return insights.slice(0, 4);
}

function buildFollowUpRecommendations(items: QuoteTimelineItem[], now: Date): string[] {
  const recommendations: string[] = [];

  const abandonItems = items.filter((i) => i.winProbabilitySignal === "ABANDON_RISK");
  for (const item of abandonItems.slice(0, 1)) {
    recommendations.push(
      `${item.customerName} — ${item.title} (${formatTRY(item.amount)}): ${ABANDON_RISK_DAYS}+ gündür sessiz, son şans takibi yap veya dosyayı kapat.`,
    );
  }

  const missingItems = items.filter(
    (i) => i.hasMissingFollowUp && i.winProbabilitySignal !== "ABANDON_RISK",
  );
  for (const item of missingItems.slice(0, 1)) {
    const gap = item.daysSinceLastContact ?? "?";
    recommendations.push(
      `${item.customerName} teklifi görüntüledi ama ${gap} gündür takip yok (${formatTRY(item.amount)}) — bugün ulaş.`,
    );
  }

  const revisionItems = items.filter((i) => i.isRevisionRisk);
  for (const item of revisionItems.slice(0, 1)) {
    recommendations.push(
      `${item.customerName} — ${item.revisionCount} revizyon talebi var (${formatTRY(item.amount)}): fiyat konusunu doğrudan konuş, revizyon döngüsünü kır.`,
    );
  }

  return recommendations.slice(0, 3);
}

function isStaleFalsePositive(item: QuoteTimelineItem, now: Date): boolean {
  if (item.lastActivityDate === null) return false;
  const daysSinceActivity = daysSince(item.lastActivityDate, now);
  return daysSinceActivity < 2;
}

function findFirstEventOfType(
  events: QuoteEventSummary[],
  eventType: QuoteEventType,
): QuoteEventSummary | undefined {
  return events.find((e) => e.eventType === eventType);
}

function findLastEventOfType(
  events: QuoteEventSummary[],
  eventType: QuoteEventType,
): QuoteEventSummary | undefined {
  return [...events].reverse().find((e) => e.eventType === eventType);
}

function findLastEventOfTypes(
  events: QuoteEventSummary[],
  eventTypes: QuoteEventType[],
): QuoteEventSummary | undefined {
  return [...events].reverse().find((e) => eventTypes.includes(e.eventType));
}

function countEventType(events: QuoteEventSummary[], eventType: QuoteEventType): number {
  return events.filter((e) => e.eventType === eventType).length;
}

function daysSince(date: Date, now: Date): number {
  return Math.floor((now.getTime() - date.getTime()) / 86400000);
}

function formatTRY(amount: number): string {
  return `₺${amount.toLocaleString("tr-TR")}`;
}

function emptyIntelligence(): QuoteTimelineIntelligence {
  return {
    items: [],
    missingFollowUpCount: 0,
    revisionRiskCount: 0,
    highEngagementCount: 0,
    abandonRiskCount: 0,
    staleFalsePositiveCount: 0,
    timelineInsights: [],
    followUpRecommendations: [],
  };
}
