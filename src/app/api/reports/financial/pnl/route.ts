import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { ApiValidationError } from "@/lib/api/validation";
import { computeManagementPnl } from "@/lib/core/reporting/management-pnl.service";

function requiredDate(value: string | null, name: string): Date {
  if (!value) throw new ApiValidationError(`${name} is required.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ApiValidationError(`${name} must be a valid date.`);
  return parsed;
}

/** Read-only management P&L (not formal statutory accounting). GET only. */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const query = new URL(request.url).searchParams;
    const periodStart = requiredDate(query.get("periodStart"), "periodStart");
    const periodEnd = requiredDate(query.get("periodEnd"), "periodEnd");
    if (periodEnd <= periodStart) throw new ApiValidationError("periodEnd must be after periodStart.");
    const pnl = await computeManagementPnl(auth.organization.id, periodStart, periodEnd);
    return ok({ pnl });
  } catch (error) {
    if (error instanceof ApiValidationError) return fail(error.message, 400);
    return authFail(error);
  }
}
