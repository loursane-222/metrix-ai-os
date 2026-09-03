import { getCalendarEvent, rescheduleCalendarEvent } from "@/lib/core/calendar/calendar-event.service";
import type { ActionExecutionEnvelope, ActionHandler, HandlerResult } from "../../execution";

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
 * rescheduleCalendarEvent service'ini sarar. Çakışma tespiti (detectConflicts)
 * bilinçli olarak burada değildir — bkz. calendar-event-create-handler.ts'nin
 * aynı konudaki notu; bu aksiyon inputSchema'sı da participants taşımaz.
 */
export const calendarEventRescheduleHandler: ActionHandler = async (
  envelope: ActionExecutionEnvelope,
): Promise<HandlerResult> => {
  const { eventId, startAt, endAt, reason } = envelope.input;
  const organizationId = envelope.executionContext.organizationId;
  const resolvedEventId = requiredString(eventId, "eventId");
  const parsedStartAt = requiredDate(startAt, "startAt");
  const parsedEndAt = requiredDate(endAt, "endAt");

  const before = await getCalendarEvent(resolvedEventId, organizationId);
  if (!before) throw new Error("Calendar event not found.");

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
