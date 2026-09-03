import { transitionCalendarEventStatus } from "@/lib/core/calendar/calendar-event.service";
import type { CalendarEventStatus } from "@prisma/client";
import type { ActionExecutionEnvelope, ActionHandler, HandlerResult } from "../../execution";

const STATUSES = ["DRAFT", "PLANNED", "CONFIRMED", "CANCELLED", "POSTPONED", "COMPLETED", "ARCHIVED"] as const;

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

/**
 * calendar_event.status_transition için Domain Action handler'ı. Mevcut
 * transitionCalendarEventStatus service'ini sarar — ALLOWED_TRANSITIONS
 * kuralı (bkz. calendar-event.service.ts) service katmanında zaten
 * uygulanıyor, burada tekrarlanmaz.
 */
export const calendarEventStatusTransitionHandler: ActionHandler = async (
  envelope: ActionExecutionEnvelope,
): Promise<HandlerResult> => {
  const { eventId, toStatus, reason } = envelope.input;
  const resolvedEventId = requiredString(eventId, "eventId");
  const resolvedToStatus = requiredString(toStatus, "toStatus");
  if (!(STATUSES as readonly string[]).includes(resolvedToStatus)) throw new Error("toStatus must be a valid CalendarEventStatus.");

  const event = await transitionCalendarEventStatus({
    eventId: resolvedEventId,
    organizationId: envelope.executionContext.organizationId,
    toStatus: resolvedToStatus as CalendarEventStatus,
    reason: typeof reason === "string" && reason.trim() ? reason.trim() : undefined,
    performedById: envelope.executionContext.actorId,
  });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "calendar_event", entityId: resolvedEventId },
    resultSummary: `calendar_event.status_transition applied: ${event.status}.`,
    metadata: { status: event.status },
    domainEvents: [],
    sideEffects: [],
  };
};
