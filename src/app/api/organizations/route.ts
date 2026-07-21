import { fail, ok } from "@/lib/api/response";
import { readJsonObject, requiredString, ApiValidationError } from "@/lib/api/validation";
import { authFail, requireCurrentUserFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { createOrganizationWithOwner } from "@/lib/core/organizations/organization.service";

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireCurrentUserFromCookies();
    const body = await readJsonObject(request);
    const result = await createOrganizationWithOwner({ userId: user.id, organizationName: requiredString(body, "organizationName"), country: "TR" });
    return ok(result, 201);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) return fail(error.message, 400);
    return authFail(error);
  }
}
