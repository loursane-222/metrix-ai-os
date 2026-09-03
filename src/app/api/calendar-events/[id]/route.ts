import { randomUUID } from "crypto";
import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { getCalendarEvent } from "@/lib/core/calendar/calendar-event.service";
import { ApiValidationError, optionalString, readJsonObject } from "@/lib/api/validation";
import { executeCanonicalOperation, canonicalOperationResultToHttpResponse } from "@/lib/canonical-operation";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { id } = await params;
    const event = await getCalendarEvent(id, auth.organization.id);
    return event ? ok({ calendarEvent: event }) : fail("Calendar event not found.", 404);
  } catch (error) { return authFail(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { id } = await params;
    const body = await readJsonObject(request);
    const correlationId = request.headers.get("X-Correlation-Id")?.trim() || randomUUID();
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || randomUUID();
    const result = await executeCanonicalOperation(
      {
        operationId: idempotencyKey,
        correlationId,
        organizationId: auth.organization.id,
        actorId: auth.user.id,
        source: "system",
        type: "UPDATE",
        domain: "calendar",
        entity: { entityType: "calendar_event", entityId: id },
        capability: "calendar.update",
        payload: {
          eventId: id,
          title: optionalString(body, "title"),
          description: optionalString(body, "description"),
          allDay: typeof body.allDay === "boolean" ? body.allDay : undefined,
        },
        revealIntent: { explicit: false },
      },
      { authContext: auth },
    );
    if (result.status !== "EXECUTED") return canonicalOperationResultToHttpResponse(result, "calendar_event.update");
    const calendarEvent = await getCalendarEvent(id, auth.organization.id);
    if (!calendarEvent) return fail("Calendar event not found after execution.", 500);
    return ok({ calendarEvent });
  } catch (error) {
    if (error instanceof ApiValidationError) return fail(error.message, error.status);
    return authFail(error);
  }
}
