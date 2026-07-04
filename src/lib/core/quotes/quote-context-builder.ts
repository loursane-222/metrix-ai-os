import { prisma } from "@/lib/core/shared/prisma";
import { listRecentEventsForQuotes } from "./quote-event.repository";
import type { QuoteStatus } from "@prisma/client";
import type { QuoteEventSummary } from "./quote-event.types";

const ACTIVE_STATUSES: QuoteStatus[] = ["DRAFT", "SENT", "VIEWED", "NEGOTIATION"];
const MAX_ACTIVE_ITEMS = 15;
const STATUS_ORDER: QuoteStatus[] = ["SENT", "VIEWED", "NEGOTIATION", "DRAFT"];

export type QuoteContextStatusSummary = {
  status: QuoteStatus;
  count: number;
  total: number;
};

export type QuoteContextActiveItem = {
  id: string;
  customerName: string;
  personName: string | null;
  title: string;
  status: QuoteStatus;
  amount: number;
  sentAt: Date | null;
  viewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  events: QuoteEventSummary[];
};

export type QuoteContext = {
  openCount: number;
  openTotal: number;
  statusSummary: QuoteContextStatusSummary[];
  activeItems: QuoteContextActiveItem[];
  lastWon: { customerName: string; title: string; amount: number } | null;
};

export async function buildQuoteContextForOrganization(
  organizationId: string,
): Promise<QuoteContext> {
  const [allActiveQuotes, lastWonQuote] = await Promise.all([
    prisma.quote.findMany({
      where: { organizationId, status: { in: ACTIVE_STATUSES } },
      select: {
        id: true,
        customerName: true,
        person: { select: { fullName: true } },
        title: true,
        status: true,
        amount: true,
        sentAt: true,
        viewedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { amount: "desc" },
    }),
    prisma.quote.findFirst({
      where: { organizationId, status: "WON" },
      select: { customerName: true, title: true, amount: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const topItems = allActiveQuotes.slice(0, MAX_ACTIVE_ITEMS);
  const eventsMap = await listRecentEventsForQuotes(topItems.map((q) => q.id));

  let openCount = 0;
  let openTotal = 0;
  const statusMap = new Map<QuoteStatus, { count: number; total: number }>();

  for (const quote of allActiveQuotes) {
    const amount = toSafeNumber(quote.amount);
    openCount++;
    openTotal += amount;
    const current = statusMap.get(quote.status) ?? { count: 0, total: 0 };
    statusMap.set(quote.status, { count: current.count + 1, total: current.total + amount });
  }

  const statusSummary: QuoteContextStatusSummary[] = STATUS_ORDER
    .filter((s) => statusMap.has(s))
    .map((s) => ({
      status: s,
      count: statusMap.get(s)!.count,
      total: statusMap.get(s)!.total,
    }));

  return {
    openCount,
    openTotal,
    statusSummary,
    activeItems: topItems.map((q) => ({
      id: q.id,
      customerName: q.customerName,
      personName: q.person?.fullName ?? null,
      title: q.title,
      status: q.status,
      amount: toSafeNumber(q.amount),
      sentAt: q.sentAt,
      viewedAt: q.viewedAt,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
      events: eventsMap.get(q.id) ?? [],
    })),
    lastWon: lastWonQuote
      ? {
          customerName: lastWonQuote.customerName,
          title: lastWonQuote.title,
          amount: toSafeNumber(lastWonQuote.amount),
        }
      : null,
  };
}

function toSafeNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
