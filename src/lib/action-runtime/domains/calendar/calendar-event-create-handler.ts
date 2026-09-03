import { createCalendarEvent } from "@/lib/core/calendar/calendar-event.service";
import { detectConflicts } from "@/lib/core/calendar/calendar-intelligence.service";
import type { CalendarEventBlockType, CalendarRecurrenceFrequency } from "@prisma/client";
import type { ActionExecutionEnvelope, ActionHandler, HandlerResult } from "../../execution";

const BLOCK_TYPES = ["MEETING", "FOCUS_TIME", "TRAVEL", "LEAVE", "PRODUCTION", "DO_NOT_DISTURB", "CUSTOMER_VISIT"] as const;
const RECURRENCE_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

type ParticipantInput = { memberId?: string; customerId?: string };

/**
 * Thrown when the requested participants have a scheduling conflict and
 * the caller did not set allowConflict — native-connector.ts maps this to
 * CanonicalOperationResultV1 status "CONFLICT", carrying the conflicting
 * events as data, never a fabricated EXECUTED/success narration.
 */
export class CalendarConflictError extends Error {
  readonly conflicts: readonly { id: string; title: string; startAt: string; endAt: string }[];
  constructor(conflicts: readonly { id: string; title: string; startAt: string; endAt: string }[]) {
    super(`Calendar event conflicts with ${conflicts.length} existing event(s).`);
    this.name = "CalendarConflictError";
    this.conflicts = conflicts;
  }
}

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
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function parseParticipants(value: unknown): ParticipantInput[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ParticipantInput => {
    if (typeof item !== "object" || item === null) return false;
    const candidate = item as Record<string, unknown>;
    const hasMember = typeof candidate.memberId === "string" && candidate.memberId.trim().length > 0;
    const hasCustomer = typeof candidate.customerId === "string" && candidate.customerId.trim().length > 0;
    return hasMember !== hasCustomer;
  });
}

/**
 * calendar_event.create için Domain Action handler'ı. Mevcut
 * createCalendarEvent + detectConflicts service'lerini sarar — Prisma'yı
 * doğrudan çağırmaz, yeni bir çakışma-tespit mantığı icat etmez. Katılımcı
 * AD çözümlemesi (isimden memberId'ye) hâlâ çağıranın işi — bu handler
 * yalnızca zaten çözümlenmiş {memberId|customerId} referanslarını kabul
 * eder ve onlar üzerinden gerçek çakışma kontrolü + oluşturma yapar.
 */
export const calendarEventCreateHandler: ActionHandler = async (
  envelope: ActionExecutionEnvelope,
): Promise<HandlerResult> => {
  const { title, description, startAt, endAt, allDay, blockType, relatedTaskId, relatedCustomerId, relatedOrderId, participants, allowConflict, recurrenceFrequency, recurrenceInterval, recurrenceUntil, recurrenceCount } = envelope.input;
  const organizationId = envelope.executionContext.organizationId;
  const actorId = envelope.executionContext.actorId;

  const parsedStartAt = requiredDate(startAt, "startAt");
  const parsedEndAt = requiredDate(endAt, "endAt");
  const parsedBlockType = typeof blockType === "string" && (BLOCK_TYPES as readonly string[]).includes(blockType) ? (blockType as CalendarEventBlockType) : undefined;
  const parsedParticipants = parseParticipants(participants);
  const parsedRecurrenceFrequency = typeof recurrenceFrequency === "string" && (RECURRENCE_FREQUENCIES as readonly string[]).includes(recurrenceFrequency) ? (recurrenceFrequency as CalendarRecurrenceFrequency) : undefined;
  const parsedRecurrenceUntil = optionalString(recurrenceUntil);

  const memberIds = parsedParticipants.flatMap((p) => (p.memberId ? [p.memberId] : []));
  const customerIds = parsedParticipants.flatMap((p) => (p.customerId ? [p.customerId] : []));
  const conflicts = await detectConflicts({
    organizationId,
    startAt: parsedStartAt,
    endAt: parsedEndAt,
    participantMemberIds: memberIds,
    participantCustomerIds: customerIds,
  });
  if (conflicts.length > 0 && allowConflict !== true) {
    throw new CalendarConflictError(
      conflicts.map((c) => ({ id: c.id, title: c.title, startAt: c.startAt.toISOString(), endAt: c.endAt.toISOString() })),
    );
  }

  const event = await createCalendarEvent({
    organizationId,
    title: requiredString(title, "title"),
    description: optionalString(description),
    startAt: parsedStartAt,
    endAt: parsedEndAt,
    allDay: typeof allDay === "boolean" ? allDay : undefined,
    blockType: parsedBlockType,
    relatedTaskId: optionalString(relatedTaskId),
    relatedCustomerId: optionalString(relatedCustomerId),
    relatedOrderId: optionalString(relatedOrderId),
    participants: parsedParticipants,
    recurrenceFrequency: parsedRecurrenceFrequency,
    recurrenceInterval: typeof recurrenceInterval === "number" ? recurrenceInterval : undefined,
    recurrenceUntil: parsedRecurrenceUntil ? new Date(parsedRecurrenceUntil) : undefined,
    recurrenceCount: typeof recurrenceCount === "number" ? recurrenceCount : undefined,
    performedById: actorId,
  });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "calendar_event", entityId: event.id },
    resultSummary: "calendar_event.create completed.",
    metadata: { title: event.title, startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString() },
    domainEvents: [],
    sideEffects: [],
  };
};
