import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, ApiValidationError } from "@/lib/api/validation";
import { createNewWorkCenter, listWorkCenters } from "@/lib/core/production/production.service";

export async function GET() {
  try {
    const auth = await requireAuthContextFromCookies();
    const workCenters = await listWorkCenters({ organizationId: auth.organization.id });
    return ok({ workCenters, count: workCenters.length });
  } catch (e) {
    return authFail(e);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const workCenter = await createNewWorkCenter({
      organizationId: auth.organization.id,
      name: optionalString(body, "name") ?? "",
      code: optionalString(body, "code") ?? "",
      notes: optionalString(body, "notes"),
    });
    return ok({ workCenter }, 201);
  } catch (e) {
    if (e instanceof ApiValidationError) return fail(e.message, 400);
    return authFail(e);
  }
}
