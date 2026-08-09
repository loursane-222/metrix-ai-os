import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { ApiValidationError, optionalString, readJsonObject } from "@/lib/api/validation";
import { transitionCalendarEventStatus } from "@/lib/core/calendar/calendar-event.service";
import type { CalendarEventStatus } from "@prisma/client";
const statuses: readonly CalendarEventStatus[] = ["DRAFT", "PLANNED", "CONFIRMED", "CANCELLED", "POSTPONED", "COMPLETED", "ARCHIVED"];
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const auth = await requireAuthContextFromCookies(); const { id } = await params; const body = await readJsonObject(request); const toStatus = optionalString(body, "toStatus"); if (!toStatus || !statuses.includes(toStatus as CalendarEventStatus)) return fail("A valid toStatus is required.", 400); const calendarEvent = await transitionCalendarEventStatus({ eventId: id, organizationId: auth.organization.id, toStatus: toStatus as CalendarEventStatus, reason: optionalString(body, "reason"), performedById: auth.user.id }); return ok({ calendarEvent }); } catch (error) { if (error instanceof ApiValidationError) return fail(error.message, 400); return authFail(error); } }
