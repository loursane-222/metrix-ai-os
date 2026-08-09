import { ApiValidationError } from "@/lib/api/validation";
import { prisma } from "@/lib/core/shared/prisma";
import type { CalendarEventSource, CalendarEventStatus, CalendarRecurrenceFrequency, Prisma } from "@prisma/client";

type ParticipantInput = { memberId?: string; customerId?: string };
export type CreateCalendarEventInput = {
  organizationId: string; title: string; description?: string; startAt: Date; endAt: Date; allDay?: boolean;
  timeZone?: string; status?: CalendarEventStatus; recurrenceFrequency?: CalendarRecurrenceFrequency;
  recurrenceInterval?: number; recurrenceUntil?: Date; recurrenceCount?: number; relatedTaskId?: string;
  relatedCustomerId?: string; relatedOrderId?: string; source?: CalendarEventSource; participants?: ParticipantInput[];
  performedById?: string;
};

const ALLOWED_TRANSITIONS: Record<CalendarEventStatus, readonly CalendarEventStatus[]> = {
  DRAFT: ["PLANNED", "CANCELLED"], PLANNED: ["CONFIRMED", "POSTPONED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "POSTPONED", "CANCELLED"], CANCELLED: [], POSTPONED: ["PLANNED", "CANCELLED"],
  COMPLETED: ["ARCHIVED"], ARCHIVED: [],
};

const include = { participants: true, statusHistory: { orderBy: { createdAt: "asc" as const } } };

function validateInput(input: CreateCalendarEventInput) {
  if (!input.organizationId.trim() || !input.title.trim()) throw new ApiValidationError("organizationId and title are required.");
  if (input.endAt <= input.startAt) throw new ApiValidationError("endAt must be after startAt.");
  if (input.recurrenceUntil && input.recurrenceCount) throw new ApiValidationError("recurrenceUntil and recurrenceCount cannot be used together.");
  if (input.recurrenceInterval !== undefined && input.recurrenceInterval < 1) throw new ApiValidationError("recurrenceInterval must be positive.");
}

async function validateRelations(input: CreateCalendarEventInput, tx: Prisma.TransactionClient) {
  const participantInputs = input.participants ?? [];
  if (participantInputs.some((p) => Boolean(p.memberId) === Boolean(p.customerId))) throw new ApiValidationError("Each participant must reference exactly one member or customer.");
  const memberIds = participantInputs.flatMap((p) => p.memberId ? [p.memberId] : []);
  const customerIds = participantInputs.flatMap((p) => p.customerId ? [p.customerId] : []);
  const [members, customers, task, customer, order] = await Promise.all([
    tx.organizationMember.count({ where: { organizationId: input.organizationId, id: { in: memberIds } } }),
    tx.customer.count({ where: { organizationId: input.organizationId, id: { in: customerIds } } }),
    input.relatedTaskId ? tx.task.findFirst({ where: { id: input.relatedTaskId, organizationId: input.organizationId }, select: { id: true } }) : true,
    input.relatedCustomerId ? tx.customer.findFirst({ where: { id: input.relatedCustomerId, organizationId: input.organizationId }, select: { id: true } }) : true,
    input.relatedOrderId ? tx.order.findFirst({ where: { id: input.relatedOrderId, organizationId: input.organizationId }, select: { id: true } }) : true,
  ]);
  if (members !== new Set(memberIds).size || customers !== new Set(customerIds).size) throw new ApiValidationError("Calendar participant not found in this organization.");
  if (!task || !customer || !order) throw new ApiValidationError("Related calendar record not found in this organization.");
}

export async function createCalendarEvent(input: CreateCalendarEventInput, outerTx?: Prisma.TransactionClient) {
  validateInput(input);
  const execute = async (tx: Prisma.TransactionClient) => {
    await validateRelations(input, tx);
    const event = await tx.calendarEvent.create({ data: {
      organizationId: input.organizationId, title: input.title.trim(), description: input.description, startAt: input.startAt, endAt: input.endAt,
      allDay: input.allDay, timeZone: input.timeZone, status: input.status, recurrenceFrequency: input.recurrenceFrequency,
      recurrenceInterval: input.recurrenceFrequency ? input.recurrenceInterval ?? 1 : undefined, recurrenceUntil: input.recurrenceUntil,
      recurrenceCount: input.recurrenceCount, relatedTaskId: input.relatedTaskId, relatedCustomerId: input.relatedCustomerId,
      relatedOrderId: input.relatedOrderId, source: input.source,
      participants: { create: (input.participants ?? []).map((p) => ({ organizationId: input.organizationId, memberId: p.memberId, customerId: p.customerId })) },
      statusHistory: { create: { organizationId: input.organizationId, toStatus: input.status ?? "PLANNED", performedById: input.performedById } },
    }, include });
    return event;
  };
  return outerTx ? execute(outerTx) : prisma.$transaction(execute);
}

function advance(date: Date, frequency: CalendarRecurrenceFrequency, interval: number): Date {
  const next = new Date(date);
  if (frequency === "DAILY") next.setUTCDate(next.getUTCDate() + interval);
  else if (frequency === "WEEKLY") next.setUTCDate(next.getUTCDate() + 7 * interval);
  else if (frequency === "MONTHLY") next.setUTCMonth(next.getUTCMonth() + interval);
  else next.setUTCFullYear(next.getUTCFullYear() + interval);
  return next;
}

export async function listCalendarEvents(input: { organizationId: string; rangeStart: Date; rangeEnd: Date }) {
  if (input.rangeEnd <= input.rangeStart) throw new ApiValidationError("rangeEnd must be after rangeStart.");
  const events = await prisma.calendarEvent.findMany({
    where: { organizationId: input.organizationId, startAt: { lt: input.rangeEnd }, OR: [{ recurrenceFrequency: { not: null } }, { endAt: { gt: input.rangeStart } }] },
    include, orderBy: { startAt: "asc" },
  });
  return events.flatMap((event) => {
    const duration = event.endAt.getTime() - event.startAt.getTime();
    if (!event.recurrenceFrequency) return [{ ...event, occurrenceId: event.id, occurrenceStartAt: event.startAt, occurrenceEndAt: event.endAt }];
    const occurrences = []; let start = event.startAt; let index = 0;
    while (start < input.rangeEnd && (!event.recurrenceCount || index < event.recurrenceCount) && (!event.recurrenceUntil || start <= event.recurrenceUntil)) {
      const end = new Date(start.getTime() + duration);
      if (end > input.rangeStart) occurrences.push({ ...event, occurrenceId: `${event.id}:${index}`, occurrenceStartAt: start, occurrenceEndAt: end });
      start = advance(start, event.recurrenceFrequency, event.recurrenceInterval ?? 1); index += 1;
    }
    return occurrences;
  });
}

export function getCalendarEvent(id: string, organizationId: string) {
  return prisma.calendarEvent.findFirst({ where: { id, organizationId }, include });
}

export async function transitionCalendarEventStatus(input: { eventId: string; organizationId: string; toStatus: CalendarEventStatus; reason?: string; performedById?: string }, outerTx?: Prisma.TransactionClient) {
  const execute = async (tx: Prisma.TransactionClient) => {
    const event = await tx.calendarEvent.findFirst({ where: { id: input.eventId, organizationId: input.organizationId } });
    if (!event) throw new ApiValidationError("Calendar event not found.");
    if (!ALLOWED_TRANSITIONS[event.status].includes(input.toStatus)) throw new ApiValidationError(`Transition from ${event.status} to ${input.toStatus} is not permitted.`);
    await tx.calendarEvent.update({ where: { id: event.id }, data: { status: input.toStatus, cancellationReason: input.toStatus === "CANCELLED" ? input.reason : undefined } });
    await tx.calendarEventStatusHistory.create({ data: { organizationId: input.organizationId, eventId: event.id, fromStatus: event.status, toStatus: input.toStatus, reason: input.reason, performedById: input.performedById } });
    return tx.calendarEvent.findUniqueOrThrow({ where: { id: event.id }, include });
  };
  return outerTx ? execute(outerTx) : prisma.$transaction(execute);
}

export async function rescheduleCalendarEvent(input: { eventId: string; organizationId: string; startAt: Date; endAt: Date; reason?: string; performedById?: string }, outerTx?: Prisma.TransactionClient) {
  if (input.endAt <= input.startAt) throw new ApiValidationError("endAt must be after startAt.");
  const execute = async (tx: Prisma.TransactionClient) => {
    const event = await tx.calendarEvent.findFirst({ where: { id: input.eventId, organizationId: input.organizationId } });
    if (!event) throw new ApiValidationError("Calendar event not found.");
    if (["CANCELLED", "COMPLETED", "ARCHIVED"].includes(event.status)) throw new ApiValidationError("This calendar event cannot be rescheduled.");
    const status = event.status === "POSTPONED" ? "PLANNED" : event.status;
    await tx.calendarEvent.update({ where: { id: event.id }, data: { startAt: input.startAt, endAt: input.endAt, postponedFromAt: event.startAt, status } });
    if (status !== event.status) await tx.calendarEventStatusHistory.create({ data: { organizationId: input.organizationId, eventId: event.id, fromStatus: event.status, toStatus: status, reason: input.reason, performedById: input.performedById } });
    return tx.calendarEvent.findUniqueOrThrow({ where: { id: event.id }, include });
  };
  return outerTx ? execute(outerTx) : prisma.$transaction(execute);
}
