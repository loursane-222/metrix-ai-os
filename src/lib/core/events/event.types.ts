import type { Event, EventSource, Prisma } from "@prisma/client";

export type CreateEventInput = {
  organizationId: string;
  actorUserId?: string | null;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Prisma.InputJsonValue;
  source?: EventSource;
};

export type EventResult = Event;
