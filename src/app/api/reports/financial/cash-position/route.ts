import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { ApiValidationError } from "@/lib/api/validation";
import { computeActualCashPosition } from "@/lib/core/reporting/cash-position.service";

function optionalDate(value: string | null, name: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ApiValidationError(`${name} must be a valid date.`);
  return parsed;
}

/** Read-only. GET only — this route has no POST/PATCH/DELETE by construction. */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const query = new URL(request.url).searchParams;
    const asOf = optionalDate(query.get("asOf"), "asOf");
    const position = await computeActualCashPosition(auth.organization.id, asOf);
    return ok({ position });
  } catch (error) {
    if (error instanceof ApiValidationError) return fail(error.message, 400);
    return authFail(error);
  }
}
