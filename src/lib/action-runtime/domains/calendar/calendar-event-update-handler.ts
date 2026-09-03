import { getCalendarEvent, updateCalendarEventDetails } from "@/lib/core/calendar/calendar-event.service";
import type { ActionExecutionEnvelope, ActionHandler, HandlerResult } from "../../execution";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

/**
 * calendar_event.update için Domain Action handler'ı — yalnızca alan
 * yaması (title/description/allDay). status ve startAt/endAt bu aksiyonun
 * kapsamı dışındadır: onlar için ayrı calendar_event.status_transition ve
 * calendar_event.reschedule aksiyonları vardır (durum geçiş kuralları ve
 * çakışma kontrolü olduğu için birleştirilmemiştir).
 */
export const calendarEventUpdateHandler: ActionHandler = async (
  envelope: ActionExecutionEnvelope,
): Promise<HandlerResult> => {
  const { eventId, title, description, allDay } = envelope.input;
  const organizationId = envelope.executionContext.organizationId;
  const resolvedEventId = requiredString(eventId, "eventId");

  if (title === undefined && description === undefined && allDay === undefined) {
    throw new Error("At least one of title, description or allDay is required.");
  }

  const before = await getCalendarEvent(resolvedEventId, organizationId);
  if (!before) throw new Error("Calendar event not found.");

  const updated = await updateCalendarEventDetails({
    eventId: resolvedEventId,
    organizationId,
    title: typeof title === "string" ? title : undefined,
    description: typeof description === "string" ? description : undefined,
    allDay: typeof allDay === "boolean" ? allDay : undefined,
  });
  if (!updated) throw new Error("Calendar event not found.");

  const changedFields = [
    ...(typeof title === "string" ? ["title"] : []),
    ...(typeof description === "string" ? ["description"] : []),
    ...(typeof allDay === "boolean" ? ["allDay"] : []),
  ];

  return {
    status: "SUCCESS",
    entityRef: { entityType: "calendar_event", entityId: resolvedEventId },
    resultSummary: `calendar_event.update applied to ${changedFields.length} field(s).`,
    metadata: { changedFields },
    domainEvents: [],
    sideEffects: [],
    compensationSnapshot: {
      eventId: resolvedEventId,
      ...(typeof title === "string" ? { title: before.title } : {}),
      ...(typeof description === "string" ? { description: before.description } : {}),
      ...(typeof allDay === "boolean" ? { allDay: before.allDay } : {}),
    },
  };
};
