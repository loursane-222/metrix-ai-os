import { prisma } from "@/lib/core/shared/prisma";
import { listEventsForClosedQuotes } from "./quote-event.repository";
import type { QuoteStatus } from "@prisma/client";
import type { QuoteEventSummary } from "./quote-event.types";

const CLOSED_STATUSES: QuoteStatus[] = ["WON", "LOST", "CANCELLED"];
const MAX_CLOSED_ITEMS = 30;
const LOOKBACK_DAYS = 90;

export type QuoteConversionContextItem = {
  id: string;
  customerName: string;
  title: string;
  amount: number;
  finalStatus: "WON" | "LOST" | "CANCELLED";
  sentAt: Date | null;
  viewedAt: Date | null;
  wonAt: Date | null;
  lostAt: Date | null;
  createdAt: Date;
  events: QuoteEventSummary[];
};

export type QuoteConversionContext = {
  items: QuoteConversionContextItem[];
  lookbackDays: number;
  totalClosed: number;
};

export async function buildQuoteConversionContextForOrganization(
  organizationId: string,
): Promise<QuoteConversionContext> {
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const closedQuotes = await prisma.quote.findMany({
    where: {
      organizationId,
      status: { in: CLOSED_STATUSES },
      updatedAt: { gte: cutoff },
    },
    select: {
      id: true,
      customerName: true,
      title: true,
      amount: true,
      status: true,
      sentAt: true,
      viewedAt: true,
      wonAt: true,
      lostAt: true,
      createdAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_CLOSED_ITEMS,
  });

  const eventsMap = await listEventsForClosedQuotes(closedQuotes.map((q) => q.id));

  const items: QuoteConversionContextItem[] = closedQuotes.map((q) => ({
    id: q.id,
    customerName: q.customerName,
    title: q.title,
    amount: toSafeNumber(q.amount),
    finalStatus: q.status as "WON" | "LOST" | "CANCELLED",
    sentAt: q.sentAt,
    viewedAt: q.viewedAt,
    wonAt: q.wonAt,
    lostAt: q.lostAt,
    createdAt: q.createdAt,
    events: eventsMap.get(q.id) ?? [],
  }));

  return {
    items,
    lookbackDays: LOOKBACK_DAYS,
    totalClosed: items.length,
  };
}

function toSafeNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
