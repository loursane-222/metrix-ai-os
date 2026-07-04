import { prisma } from "@/lib/core/shared/prisma";
import type { CreateQuoteEventInput, QuoteEventSummary } from "./quote-event.types";

const MAX_EVENTS_PER_QUOTE = 5;
const EVENT_HISTORY_DAYS = 90;
const DEDUP_WINDOW_MS = 60 * 1000;

export async function createQuoteEvent(input: CreateQuoteEventInput): Promise<void> {
  const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS);
  const existing = await prisma.quoteEvent.findFirst({
    where: {
      quoteId: input.quoteId,
      eventType: input.eventType,
      createdAt: { gte: windowStart },
    },
    select: { id: true },
  });

  if (existing) return;

  await prisma.quoteEvent.create({
    data: {
      organizationId: input.organizationId,
      quoteId: input.quoteId,
      conversationId: input.conversationId ?? null,
      eventType: input.eventType,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      note: input.note ?? null,
      source: input.source ?? "AI_SUGGESTED",
    },
  });
}

export async function listEventsForClosedQuotes(
  quoteIds: string[],
): Promise<Map<string, QuoteEventSummary[]>> {
  if (quoteIds.length === 0) return new Map();

  const cutoff = new Date(Date.now() - EVENT_HISTORY_DAYS * 24 * 60 * 60 * 1000);

  const rows = await prisma.quoteEvent.findMany({
    where: {
      quoteId: { in: quoteIds },
      createdAt: { gte: cutoff },
    },
    select: {
      quoteId: true,
      eventType: true,
      fromStatus: true,
      toStatus: true,
      note: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const map = new Map<string, QuoteEventSummary[]>();

  for (const row of rows) {
    const list = map.get(row.quoteId) ?? [];
    list.push({
      eventType: row.eventType,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      note: row.note,
      createdAt: row.createdAt,
    });
    map.set(row.quoteId, list);
  }

  for (const [id, events] of map.entries()) {
    if (events.length > MAX_EVENTS_PER_QUOTE) {
      map.set(id, events.slice(events.length - MAX_EVENTS_PER_QUOTE));
    }
  }

  return map;
}

export async function listRecentEventsForQuotes(
  quoteIds: string[],
): Promise<Map<string, QuoteEventSummary[]>> {
  if (quoteIds.length === 0) return new Map();

  const cutoff = new Date(Date.now() - EVENT_HISTORY_DAYS * 24 * 60 * 60 * 1000);

  const rows = await prisma.quoteEvent.findMany({
    where: {
      quoteId: { in: quoteIds },
      createdAt: { gte: cutoff },
    },
    select: {
      quoteId: true,
      eventType: true,
      fromStatus: true,
      toStatus: true,
      note: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const map = new Map<string, QuoteEventSummary[]>();

  for (const row of rows) {
    const list = map.get(row.quoteId) ?? [];
    list.push({
      eventType: row.eventType,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      note: row.note,
      createdAt: row.createdAt,
    });
    map.set(row.quoteId, list);
  }

  for (const [id, events] of map.entries()) {
    if (events.length > MAX_EVENTS_PER_QUOTE) {
      map.set(id, events.slice(events.length - MAX_EVENTS_PER_QUOTE));
    }
  }

  return map;
}
