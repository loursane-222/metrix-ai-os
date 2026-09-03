import { getCalendarEvent, rescheduleCalendarEvent } from "@/lib/core/calendar/calendar-event.service";
import { detectConflicts } from "@/lib/core/calendar/calendar-intelligence.service";
import type { ActionExecutionEnvelope, ActionHandler, HandlerResult } from "../../execution";
import { CalendarConflictError } from "./calendar-event-create-handler";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function requiredDate(value: unknown, field: string): Date {
  const raw = requiredString(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid ISO date string.`);
  return date;
}

/**
 * calendar_event.reschedule için Domain Action handler'ı. Mevcut
 * rescheduleCalendarEvent + detectConflicts service'lerini sarar — aynı
 * mevcut katılımcı kümesi (before.participants) üzerinden çakışma kontrolü
 * yapar, calendar-event-create-handler.ts'deki desenle birebir aynı.
 */
export const calendarEventRescheduleHandler: ActionHandler = async (
  envelope: ActionExecutionEnvelope,
): Promise<HandlerResult> => {
  const { eventId, startAt, endAt, reason, allowConflict } = envelope.input;
  const organizationId = envelope.executionContext.organizationId;
  const resolvedEventId = requiredString(eventId, "eventId");
  const parsedStartAt = requiredDate(startAt, "startAt");
  const parsedEndAt = requiredDate(endAt, "endAt");

  const before = await getCalendarEvent(resolvedEventId, organizationId);
  if (!before) throw new Error("Calendar event not found.");

  const conflicts = await detectConflicts({
    organizationId,
    startAt: parsedStartAt,
    endAt: parsedEndAt,
    participantMemberIds: before.participants.flatMap((p) => (p.memberId ? [p.memberId] : [])),
    participantCustomerIds: before.participants.flatMap((p) => (p.customerId ? [p.customerId] : [])),
    excludeEventId: resolvedEventId,
  });
  if (conflicts.length > 0 && allowConflict !== true) {
    throw new CalendarConflictError(
      conflicts.map((c) => ({ id: c.id, title: c.title, startAt: c.startAt.toISOString(), endAt: c.endAt.toISOString() })),
    );
  }

  const event = await rescheduleCalendarEvent({
    eventId: resolvedEventId,
    organizationId,
    startAt: parsedStartAt,
    endAt: parsedEndAt,
    reason: typeof reason === "string" && reason.trim() ? reason.trim() : undefined,
    performedById: envelope.executionContext.actorId,
  });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "calendar_event", entityId: resolvedEventId },
    resultSummary: "calendar_event.reschedule completed.",
    metadata: { startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString() },
    domainEvents: [],
    sideEffects: [],
    compensationSnapshot: { eventId: resolvedEventId, startAt: before.startAt.toISOString(), endAt: before.endAt.toISOString() },
  };
};
