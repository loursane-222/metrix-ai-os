import { requireAuthContextFromCookies, authFail } from "@/lib/auth/guards/api-auth-guard";
import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  optionalString,
  readJsonObject,
} from "@/lib/api/validation";
import { readOnboardingAnswers } from "@/lib/onboarding/onboarding-api.validation";
import {
  assertCanManageOnboarding,
  saveOnboardingProgress,
} from "@/lib/onboarding/onboarding-experience.service";

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireAuthContextFromCookies();
    assertCanManageOnboarding(context);

    const body = await readJsonObject(request);
    const organization = await saveOnboardingProgress({
      organizationId: context.organization.id,
      userId: context.user.id,
      answers: readOnboardingAnswers(body),
      step: optionalString(body, "step") ?? "BUSINESS_PROFILE",
    });

    return ok({
      organization,
    });
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}
