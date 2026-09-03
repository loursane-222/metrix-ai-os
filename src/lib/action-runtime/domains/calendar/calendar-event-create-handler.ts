import { createCalendarEvent } from "@/lib/core/calendar/calendar-event.service";
import type { CalendarEventBlockType } from "@prisma/client";
import type { ActionExecutionEnvelope, ActionHandler, HandlerResult } from "../../execution";

const BLOCK_TYPES = ["MEETING", "FOCUS_TIME", "TRAVEL", "LEAVE", "PRODUCTION", "DO_NOT_DISTURB", "CUSTOMER_VISIT"] as const;

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

/**
 * calendar_event.create için Domain Action handler'ı. Mevcut
 * createCalendarEvent service'ini sarar — Prisma'yı doğrudan çağırmaz.
 *
 * Katılımcı çözümleme ve çakışma tespiti (detectConflicts) bilinçli olarak
 * bu handler'ın kapsamı dışındadır: bunlar interaktif bir onay/iptal
 * akışına (calendar-command-channel) bağlıdır ve bu aksiyonun inputSchema'sı
 * participants taşımaz — dolayısıyla çakışabilecek bir katılımcı kümesi
 * zaten yoktur. Katılımcılı/çakışma-duyarlı oluşturma, mevcut
 * calendarManagementConversationExtension fast-path'i üzerinden kalmaya
 * devam eder (bkz. final rapor, Bölüm D/N).
 */
export const calendarEventCreateHandler: ActionHandler = async (
  envelope: ActionExecutionEnvelope,
): Promise<HandlerResult> => {
  const { title, description, startAt, endAt, allDay, blockType, relatedTaskId, relatedCustomerId, relatedOrderId } = envelope.input;
  const organizationId = envelope.executionContext.organizationId;
  const actorId = envelope.executionContext.actorId;

  const parsedStartAt = requiredDate(startAt, "startAt");
  const parsedEndAt = requiredDate(endAt, "endAt");
  const parsedBlockType = typeof blockType === "string" && (BLOCK_TYPES as readonly string[]).includes(blockType) ? (blockType as CalendarEventBlockType) : undefined;

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
