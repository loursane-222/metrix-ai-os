import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { ApiValidationError } from "@/lib/api/validation";
import { computeAgingReport } from "@/lib/core/reporting/obligation-aging.service";

function optionalDate(value: string | null, name: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ApiValidationError(`${name} must be a valid date.`);
  return parsed;
}

/** Read-only receivable/payable aging, canonical ObligationScheduleLine only. GET only. */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const query = new URL(request.url).searchParams;
    const direction = query.get("direction");
    if (direction !== "RECEIVABLE" && direction !== "PAYABLE") throw new ApiValidationError("direction must be RECEIVABLE or PAYABLE.");
    const asOf = optionalDate(query.get("asOf"), "asOf") ?? new Date();
    const aging = await computeAgingReport(auth.organization.id, direction, asOf, auth.user.timezone);
    return ok({ aging });
  } catch (error) {
    if (error instanceof ApiValidationError) return fail(error.message, 400);
    return authFail(error);
  }
}
