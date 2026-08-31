import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { ApiValidationError } from "@/lib/api/validation";
import { computeFinancialObligationProjections } from "@/lib/core/calendar/calendar-financial-projection.service";

function date(value: string | undefined, name: string): Date {
  const parsed = value ? new Date(value) : new Date(Number.NaN);
  if (Number.isNaN(parsed.getTime())) throw new ApiValidationError(`${name} must be a valid date.`);
  return parsed;
}

/**
 * Read-only projection of canonical financial obligations onto the Calendar
 * date range — mirrors GET /api/calendar-events exactly (same rangeStart/
 * rangeEnd contract) so the frontend can fetch it as a fifth "borrowed
 * source" alongside tasks/invoices/payments/collection-actions. Never
 * accepts a POST/PATCH/DELETE — this route has no financial-mutation
 * surface at all, by construction.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const query = new URL(request.url).searchParams;
    const rangeStart = date(query.get("rangeStart") ?? undefined, "rangeStart");
    const rangeEnd = date(query.get("rangeEnd") ?? undefined, "rangeEnd");
    const financialProjections = await computeFinancialObligationProjections({
      organizationId: auth.organization.id,
      dueDateFrom: rangeStart,
      dueDateTo: rangeEnd,
      timeZone: auth.user.timezone,
    });
    return ok({ financialProjections, count: financialProjections.length });
  } catch (error) {
    if (error instanceof ApiValidationError) return fail(error.message, 400);
    return authFail(error);
  }
}
