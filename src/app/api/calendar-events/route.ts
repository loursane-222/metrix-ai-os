import { randomUUID } from "crypto";
import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { ApiValidationError, optionalString, readJsonObject } from "@/lib/api/validation";
import { getCalendarEvent } from "@/lib/core/calendar/calendar-event.service";
import type { CalendarEventBlockType, CalendarRecurrenceFrequency } from "@prisma/client";
import { executeCanonicalOperation, canonicalOperationResultToHttpResponse } from "@/lib/canonical-operation";
import { resolveCanonicalCalendarProjection, toWorkspaceCalendarItem } from "@/lib/company-intelligence/calendar-projection";

function date(value: string | undefined, name: string): Date {
  const parsed = value ? new Date(value) : new Date(Number.NaN);
  if (Number.isNaN(parsed.getTime())) throw new ApiValidationError(`${name} must be a valid date.`);
  return parsed;
}

/**
 * Unified Calendar Truth: reads through the same canonical projection
 * conversation evidence uses (see company-intelligence/calendar-projection.ts's
 * own doc comment for the full root-cause story) — this is the fix for the
 * Workspace/narration truth divergence, not a redesign of what Workspace
 * renders. Native rows are returned exactly as before (unchanged shape);
 * Google and iCloud events are additively appended, projected into the same
 * minimal shape the client already reads off every row.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const query = new URL(request.url).searchParams;
    const rangeStart = date(query.get("rangeStart") ?? undefined, "rangeStart");
    const rangeEnd = date(query.get("rangeEnd") ?? undefined, "rangeEnd");
    const projection = await resolveCanonicalCalendarProjection({ organizationId: auth.organization.id, userId: auth.user.id, rangeStart, rangeEnd });
    const events = [...projection.nativeEvents, ...projection.googleEvents.map(toWorkspaceCalendarItem), ...projection.icloudEvents.map(toWorkspaceCalendarItem)];
    return ok({ events, count: events.length, sourceStatuses: projection.sourceStatuses });
  } catch (error) { if (error instanceof ApiValidationError) return fail(error.message, 400); return authFail(error); }
}

/**
 * Katılımcı isim çözümlemesi (client, calendar-management-conversation-
 * extension.ts) burada değişmedi — bu route zaten yalnızca ÖNCEDEN
 * çözümlenmiş {memberId|customerId} referansları kabul ediyordu. Çakışma
 * tespiti + oluşturma artık calendar.create capability'si üzerinden
 * calendarEventCreateHandler'da yaşıyor (bkz. o dosya) — bu route onu
 * ikinci kez yapmaz, yalnızca CanonicalOperationResultV1'i HTTP'ye çevirir.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const title = optionalString(body, "title"); if (!title) return fail("title is required.", 400);
    const participants = Array.isArray(body.participants) ? body.participants.filter((item): item is { memberId?: string; customerId?: string } => typeof item === "object" && item !== null) : [];
    const startAt = date(optionalString(body, "startAt"), "startAt");
    const endAt = date(optionalString(body, "endAt"), "endAt");

    const correlationId = request.headers.get("X-Correlation-Id")?.trim() || randomUUID();
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || randomUUID();
    const result = await executeCanonicalOperation(
      {
        operationId: idempotencyKey,
        correlationId,
        organizationId: auth.organization.id,
        actorId: auth.user.id,
        source: "system",
        type: "CREATE",
        domain: "calendar",
        entity: { entityType: "calendar_event" },
        capability: "calendar.create",
        payload: {
          title,
          description: optionalString(body, "description"),
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          blockType: optionalString(body, "blockType") as CalendarEventBlockType | undefined,
          allDay: typeof body.allDay === "boolean" ? body.allDay : undefined,
          recurrenceFrequency: optionalString(body, "recurrenceFrequency") as CalendarRecurrenceFrequency | undefined,
          recurrenceInterval: typeof body.recurrenceInterval === "number" ? body.recurrenceInterval : undefined,
          recurrenceUntil: optionalString(body, "recurrenceUntil"),
          recurrenceCount: typeof body.recurrenceCount === "number" ? body.recurrenceCount : undefined,
          relatedTaskId: optionalString(body, "relatedTaskId"),
          relatedCustomerId: optionalString(body, "relatedCustomerId"),
          relatedOrderId: optionalString(body, "relatedOrderId"),
          participants,
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
    if (result.status !== "EXECUTED") return canonicalOperationResultToHttpResponse(result, "calendar_event.create");
    const event = result.entity?.entityId ? await getCalendarEvent(result.entity.entityId, auth.organization.id) : null;
    if (!event) return fail("Calendar event not found after execution.", 500);
    return ok({ calendarEvent: event }, 201);
  } catch (error) { if (error instanceof ApiValidationError) return fail(error.message, 400); return authFail(error); }
}
