import { prisma } from "@/lib/core/shared/prisma";
import type {
  CreateCollectionActionEventInput,
  CollectionActionEventSummary,
} from "./collection-action-event.types";

const MAX_EVENTS_PER_ACTION = 5;
const EVENT_HISTORY_DAYS = 90;
const DEDUP_WINDOW_MS = 60 * 1000;

export async function createCollectionActionEvent(
  input: CreateCollectionActionEventInput,
): Promise<void> {
  const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS);
  const existing = await prisma.collectionActionEvent.findFirst({
    where: {
      collectionActionId: input.collectionActionId,
      eventType: input.eventType,
      createdAt: { gte: windowStart },
    },
    select: { id: true },
  });

  if (existing) return;

  await prisma.collectionActionEvent.create({
    data: {
      organizationId: input.organizationId,
      collectionActionId: input.collectionActionId,
      conversationId: input.conversationId ?? null,
      eventType: input.eventType,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      note: input.note ?? null,
      expectedDate: input.expectedDate ?? null,
      source: input.source ?? "AI_SUGGESTED",
    },
  });
}

export async function listRecentEventsForActions(
  actionIds: string[],
): Promise<Map<string, CollectionActionEventSummary[]>> {
  if (actionIds.length === 0) return new Map();

  const cutoff = new Date(Date.now() - EVENT_HISTORY_DAYS * 24 * 60 * 60 * 1000);

  const rows = await prisma.collectionActionEvent.findMany({
    where: {
      collectionActionId: { in: actionIds },
      createdAt: { gte: cutoff },
    },
    select: {
      collectionActionId: true,
      eventType: true,
      fromStatus: true,
      toStatus: true,
      note: true,
      expectedDate: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const map = new Map<string, CollectionActionEventSummary[]>();

  for (const row of rows) {
    const list = map.get(row.collectionActionId) ?? [];
    list.push({
      eventType: row.eventType,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      note: row.note,
      expectedDate: row.expectedDate,
      createdAt: row.createdAt,
    });
    map.set(row.collectionActionId, list);
  }

  for (const [id, events] of map.entries()) {
    if (events.length > MAX_EVENTS_PER_ACTION) {
      map.set(id, events.slice(events.length - MAX_EVENTS_PER_ACTION));
    }
  }

  return map;
}
