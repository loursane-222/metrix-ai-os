import { randomUUID } from "crypto";
import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { ApiValidationError, optionalString, readJsonObject } from "@/lib/api/validation";
import { getCalendarEvent } from "@/lib/core/calendar/calendar-event.service";
import { executeCanonicalOperation, canonicalOperationResultToHttpResponse } from "@/lib/canonical-operation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { id } = await params;
    const body = await readJsonObject(request);
    const startAt = new Date(optionalString(body, "startAt") ?? "");
    const endAt = new Date(optionalString(body, "endAt") ?? "");
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return fail("startAt and endAt are required.", 400);

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
        capability: "calendar.reschedule",
        payload: {
          eventId: id,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          reason: optionalString(body, "reason"),
          allowConflict: body.allowConflict === true,
        },
        revealIntent: { explicit: false },
      },
      { authContext: auth },
    );

    if (result.status === "CONFLICT" && result.failureClassification === "SCHEDULING_CONFLICT") {
      return Response.json(
        { ok: false, error: { message: "Seçili katılımcılar için takvim çakışması var." }, data: result.data },
        { status: 409 },
      );
    }
    if (result.status !== "EXECUTED") return canonicalOperationResultToHttpResponse(result, "calendar_event.reschedule");
    const calendarEvent = await getCalendarEvent(id, auth.organization.id);
    if (!calendarEvent) return fail("Calendar event not found after execution.", 500);
    return ok({ calendarEvent });
  } catch (error) {
    if (error instanceof ApiValidationError) return fail(error.message, error.status);
    return authFail(error);
  }
}
