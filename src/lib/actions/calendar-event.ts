import { createHash } from "node:crypto";

import { z } from "zod";

import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";

const CalendarCreateInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(500),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  allDay: z.boolean().default(false),
  notes: z.string().trim().max(5000).optional()
});

export type CalendarCreateInput = z.input<typeof CalendarCreateInputSchema>;

type ParsedCreateInput = z.output<typeof CalendarCreateInputSchema>;

const CalendarUpdateInputSchema = z
  .object({
    actorUserId: z.string().trim().min(1),
    organizationId: z.string().trim().min(1),
    idempotencyKey: z.string().trim().min(1).max(128),
    eventId: z.string().trim().min(1),
    title: z.string().trim().min(1).max(500).optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).optional(),
    allDay: z.boolean().optional(),
    notes: z.string().trim().max(5000).optional()
  })
  .refine(
    input =>
      input.title !== undefined ||
      input.startsAt !== undefined ||
      input.endsAt !== undefined ||
      input.allDay !== undefined ||
      input.notes !== undefined,
    { message: "At least one mutable field is required" }
  );

export type CalendarUpdateInput = z.input<typeof CalendarUpdateInputSchema>;

type ParsedUpdateInput = z.output<typeof CalendarUpdateInputSchema>;

export type VerifiedCalendarEventResult = {
  action: "calendar.create" | "calendar.update";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    allDay: boolean;
    notes: string | null;
  };
};

export class InvalidCalendarRangeError extends Error {
  readonly code = "INVALID_CALENDAR_RANGE";
  constructor() {
    super("Calendar event must end after it starts");
    this.name = "InvalidCalendarRangeError";
  }
}

export class CalendarEventNotFoundError extends Error {
  readonly code = "CALENDAR_EVENT_NOT_FOUND";
  constructor() {
    super("Calendar event was not found in the authorized organization");
    this.name = "CalendarEventNotFoundError";
  }
}

export class CalendarIdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";
  constructor() {
    super("Idempotency key was already used with different input");
    this.name = "CalendarIdempotencyConflictError";
  }
}

export class CalendarVerificationError extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";
  constructor() {
    super("Action could not be verified by readback");
    this.name = "CalendarVerificationError";
  }
}

function isUniqueConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  return (error as { code?: string }).code === "P2002";
}

function createRequestHash(input: ParsedCreateInput): string {
  const canonical = JSON.stringify({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    title: input.title,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    allDay: input.allDay,
    notes: input.notes ?? null
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function updateRequestHash(input: ParsedUpdateInput): string {
  const canonical = JSON.stringify({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    eventId: input.eventId,
    title: input.title ?? null,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    allDay: input.allDay ?? null,
    notes: input.notes ?? null
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function toResult(event: {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  notes: string | null;
}) {
  return {
    id: event.id,
    title: event.title,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    allDay: event.allDay,
    notes: event.notes
  };
}

async function readbackAndVerifyCreate(
  input: ParsedCreateInput,
  eventId: string,
  replayed: boolean
): Promise<VerifiedCalendarEventResult> {
  const event = await db.calendarEvent.findFirst({
    where: { id: eventId, organizationId: input.organizationId }
  });

  if (
    !event ||
    event.title !== input.title ||
    event.startsAt.toISOString() !== new Date(input.startsAt).toISOString() ||
    event.endsAt.toISOString() !== new Date(input.endsAt).toISOString() ||
    event.allDay !== input.allDay
  ) {
    throw new CalendarVerificationError();
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "calendar.create",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: { status: "VERIFIED", verifiedAt: new Date() }
  });

  return { action: "calendar.create", status: "VERIFIED", verified: true, replayed, event: toResult(event) };
}

async function resolveExistingCreate(
  input: ParsedCreateInput,
  hash: string
): Promise<VerifiedCalendarEventResult | null> {
  const existing = await db.actionExecution.findUnique({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "calendar.create",
        idempotencyKey: input.idempotencyKey
      }
    }
  });

  if (!existing) return null;
  if (existing.requestHash !== hash) throw new CalendarIdempotencyConflictError();

  return readbackAndVerifyCreate(input, existing.resourceId, true);
}

export async function createCalendarEvent(
  rawInput: CalendarCreateInput
): Promise<VerifiedCalendarEventResult> {
  const input = CalendarCreateInputSchema.parse(rawInput);

  if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    throw new InvalidCalendarRangeError();
  }

  await requireOrganizationAccess({ userId: input.actorUserId, organizationId: input.organizationId });

  const hash = createRequestHash(input);

  const existing = await resolveExistingCreate(input, hash);
  if (existing) return existing;

  let eventId: string;

  try {
    const created = await db.$transaction(async tx => {
      const raceCheck = await tx.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId: input.organizationId,
            actionType: "calendar.create",
            idempotencyKey: input.idempotencyKey
          }
        }
      });

      if (raceCheck) {
        if (raceCheck.requestHash !== hash) throw new CalendarIdempotencyConflictError();
        return { eventId: raceCheck.resourceId, replayed: true };
      }

      const event = await tx.calendarEvent.create({
        data: {
          organizationId: input.organizationId,
          userId: input.actorUserId,
          title: input.title,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          allDay: input.allDay,
          notes: input.notes
        }
      });

      await tx.actionExecution.create({
        data: {
          organizationId: input.organizationId,
          actionType: "calendar.create",
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          resourceType: "CalendarEvent",
          resourceId: event.id,
          status: "PENDING"
        }
      });

      return { eventId: event.id, replayed: false };
    });

    eventId = created.eventId;

    if (created.replayed) {
      return readbackAndVerifyCreate(input, eventId, true);
    }
  } catch (error) {
    if (error instanceof CalendarIdempotencyConflictError) throw error;
    if (!isUniqueConflict(error)) throw error;

    const raced = await resolveExistingCreate(input, hash);
    if (!raced) throw error;
    return raced;
  }

  return readbackAndVerifyCreate(input, eventId, false);
}

export async function listCalendarEvents(input: {
  actorUserId: string;
  organizationId: string;
  startsBefore?: string;
  endsAfter?: string;
}) {
  await requireOrganizationAccess({ userId: input.actorUserId, organizationId: input.organizationId });
  const events = await db.calendarEvent.findMany({
    where: {
      organizationId: input.organizationId,
      userId: input.actorUserId,
      ...(input.startsBefore ? { startsAt: { lte: new Date(input.startsBefore) } } : {}),
      ...(input.endsAfter ? { endsAt: { gte: new Date(input.endsAfter) } } : {})
    },
    orderBy: { startsAt: "asc" }
  });
  return events.map(toResult);
}

async function readbackAndVerifyUpdate(
  input: ParsedUpdateInput,
  replayed: boolean
): Promise<VerifiedCalendarEventResult> {
  const event = await db.calendarEvent.findFirst({
    where: { id: input.eventId, organizationId: input.organizationId }
  });

  if (
    !event ||
    (input.title !== undefined && event.title !== input.title) ||
    (input.startsAt !== undefined && event.startsAt.toISOString() !== new Date(input.startsAt).toISOString()) ||
    (input.endsAt !== undefined && event.endsAt.toISOString() !== new Date(input.endsAt).toISOString()) ||
    (input.allDay !== undefined && event.allDay !== input.allDay) ||
    (input.notes !== undefined && event.notes !== input.notes)
  ) {
    throw new CalendarVerificationError();
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "calendar.update",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: { status: "VERIFIED", verifiedAt: new Date() }
  });

  return { action: "calendar.update", status: "VERIFIED", verified: true, replayed, event: toResult(event) };
}

async function resolveExistingUpdate(
  input: ParsedUpdateInput,
  hash: string
): Promise<VerifiedCalendarEventResult | null> {
  const existing = await db.actionExecution.findUnique({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "calendar.update",
        idempotencyKey: input.idempotencyKey
      }
    }
  });

  if (!existing) return null;
  if (existing.requestHash !== hash) throw new CalendarIdempotencyConflictError();

  return readbackAndVerifyUpdate(input, true);
}

export async function updateCalendarEvent(
  rawInput: CalendarUpdateInput
): Promise<VerifiedCalendarEventResult> {
  const input = CalendarUpdateInputSchema.parse(rawInput);

  await requireOrganizationAccess({ userId: input.actorUserId, organizationId: input.organizationId });

  const hash = updateRequestHash(input);

  const existing = await resolveExistingUpdate(input, hash);
  if (existing) return existing;

  try {
    const outcome = await db.$transaction(async tx => {
      const raceCheck = await tx.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId: input.organizationId,
            actionType: "calendar.update",
            idempotencyKey: input.idempotencyKey
          }
        }
      });

      if (raceCheck) {
        if (raceCheck.requestHash !== hash) throw new CalendarIdempotencyConflictError();
        return { replayed: true };
      }

      const target = await tx.calendarEvent.findFirst({
        where: { id: input.eventId, organizationId: input.organizationId },
        select: { id: true, startsAt: true, endsAt: true }
      });

      if (!target) throw new CalendarEventNotFoundError();

      const startsAt = input.startsAt ? new Date(input.startsAt) : target.startsAt;
      const endsAt = input.endsAt ? new Date(input.endsAt) : target.endsAt;
      if (endsAt <= startsAt) throw new InvalidCalendarRangeError();

      await tx.calendarEvent.update({
        where: { id: target.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.startsAt !== undefined ? { startsAt } : {}),
          ...(input.endsAt !== undefined ? { endsAt } : {}),
          ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {})
        }
      });

      await tx.actionExecution.create({
        data: {
          organizationId: input.organizationId,
          actionType: "calendar.update",
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          resourceType: "CalendarEvent",
          resourceId: target.id,
          status: "PENDING"
        }
      });

      return { replayed: false };
    });

    if (outcome.replayed) {
      return readbackAndVerifyUpdate(input, true);
    }
  } catch (error) {
    if (
      error instanceof CalendarIdempotencyConflictError ||
      error instanceof CalendarEventNotFoundError ||
      error instanceof InvalidCalendarRangeError
    ) {
      throw error;
    }

    if (!isUniqueConflict(error)) throw error;

    const raced = await resolveExistingUpdate(input, hash);
    if (!raced) throw error;
    return raced;
  }

  return readbackAndVerifyUpdate(input, false);
}
