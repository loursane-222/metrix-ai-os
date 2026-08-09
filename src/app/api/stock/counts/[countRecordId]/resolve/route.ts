import { fail, ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { ApiValidationError, optionalString, readJsonObject } from "@/lib/api/validation";
import { resolveInventoryVariance } from "@/lib/core/stock/stock-intelligence.service";

export async function POST(request: Request, { params }: { params: Promise<{ countRecordId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { countRecordId } = await params;
    const body = await readJsonObject(request);
    const resolution = optionalString(body, "resolution");
    if (resolution !== "CONFIRM" && resolution !== "DISMISS") return fail("resolution must be CONFIRM or DISMISS.", 400);
    const record = await resolveInventoryVariance(countRecordId, auth.organization.id, resolution, optionalString(body, "note"), auth.user.id);
    return ok({ record });
  } catch (error) {
    if (error instanceof ApiValidationError) return fail(error.message, 400);
    return authFail(error);
  }
}
