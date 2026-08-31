import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { ApiValidationError } from "@/lib/api/validation";
import { computeForecastCashFlow } from "@/lib/core/reporting/forecast-cash-flow.service";

function optionalDate(value: string | null, name: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ApiValidationError(`${name} must be a valid date.`);
  return parsed;
}

/** Read-only forecast, canonical obligations/instruments only. GET only. */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const query = new URL(request.url).searchParams;
    const asOf = optionalDate(query.get("asOf"), "asOf") ?? new Date();
    const horizonDaysRaw = query.get("horizonDays");
    const horizonDays = horizonDaysRaw ? Number(horizonDaysRaw) : undefined;
    if (horizonDaysRaw && (!Number.isFinite(horizonDays) || horizonDays! <= 0)) throw new ApiValidationError("horizonDays must be a positive number.");
    const forecast = await computeForecastCashFlow(auth.organization.id, asOf, horizonDays);
    return ok({ forecast });
  } catch (error) {
    if (error instanceof ApiValidationError) return fail(error.message, 400);
    return authFail(error);
  }
}
