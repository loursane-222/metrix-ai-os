import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { ApiValidationError, optionalString, readJsonObject } from "@/lib/api/validation";
import { createCalendarEvent, listCalendarEvents } from "@/lib/core/calendar/calendar-event.service";
import type { CalendarRecurrenceFrequency } from "@prisma/client";

function date(value: string | undefined, name: string): Date {
  const parsed = value ? new Date(value) : new Date(Number.NaN);
  if (Number.isNaN(parsed.getTime())) throw new ApiValidationError(`${name} must be a valid date.`);
  return parsed;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const query = new URL(request.url).searchParams;
    const rangeStart = date(query.get("rangeStart") ?? undefined, "rangeStart");
    const rangeEnd = date(query.get("rangeEnd") ?? undefined, "rangeEnd");
    const events = await listCalendarEvents({ organizationId: auth.organization.id, rangeStart, rangeEnd });
    return ok({ events, count: events.length });
  } catch (error) { if (error instanceof ApiValidationError) return fail(error.message, 400); return authFail(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies(); const body = await readJsonObject(request);
    const title = optionalString(body, "title"); if (!title) return fail("title is required.", 400);
    const frequency = optionalString(body, "recurrenceFrequency") as CalendarRecurrenceFrequency | undefined;
    const event = await createCalendarEvent({ organizationId: auth.organization.id, title, description: optionalString(body, "description"),
      startAt: date(optionalString(body, "startAt"), "startAt"), endAt: date(optionalString(body, "endAt"), "endAt"),
      allDay: typeof body.allDay === "boolean" ? body.allDay : undefined, recurrenceFrequency: frequency,
      recurrenceInterval: typeof body.recurrenceInterval === "number" ? body.recurrenceInterval : undefined,
      recurrenceUntil: optionalString(body, "recurrenceUntil") ? date(optionalString(body, "recurrenceUntil"), "recurrenceUntil") : undefined,
      recurrenceCount: typeof body.recurrenceCount === "number" ? body.recurrenceCount : undefined,
      relatedTaskId: optionalString(body, "relatedTaskId"), relatedCustomerId: optionalString(body, "relatedCustomerId"), relatedOrderId: optionalString(body, "relatedOrderId"),
      participants: Array.isArray(body.participants) ? body.participants.filter((item): item is { memberId?: string; customerId?: string } => typeof item === "object" && item !== null) : undefined,
      performedById: auth.user.id });
    return ok({ calendarEvent: event }, 201);
  } catch (error) { if (error instanceof ApiValidationError) return fail(error.message, 400); return authFail(error); }
}
