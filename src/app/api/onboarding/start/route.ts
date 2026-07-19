import { startOrganizationOnboarding } from "@/lib/application/onboarding/onboarding.service";
import { authFail, requireCurrentUserFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  optionalString,
  readJsonObject,
  requiredString,
} from "@/lib/api/validation";

export async function POST(request: Request): Promise<Response> {
  try {
    const currentUser = await requireCurrentUserFromCookies();
    const body = await readJsonObject(request);
    const result = await startOrganizationOnboarding({
      userId: currentUser.id,
      organizationName: requiredString(body, "organizationName"),
      industry: optionalString(body, "industry"),
      companySize: optionalString(body, "companySize"),
      country: optionalString(body, "country"),
      city: optionalString(body, "city"),
      description: optionalString(body, "description"),
    });

    return ok(result);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}
