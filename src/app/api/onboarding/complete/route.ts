import { requireAuthContextFromCookies, authFail } from "@/lib/auth/guards/api-auth-guard";
import { fail, ok } from "@/lib/api/response";
import { ApiValidationError, readJsonObject } from "@/lib/api/validation";
import {
  readOnboardingAnswers,
  readOptionalDiscoveryAnalysis,
} from "@/lib/onboarding/onboarding-api.validation";
import {
  assertCanManageOnboarding,
  completeOnboardingExperience,
} from "@/lib/onboarding/onboarding-experience.service";

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireAuthContextFromCookies();
    assertCanManageOnboarding(context);

    const body = await readJsonObject(request);
    const result = await completeOnboardingExperience({
      organizationId: context.organization.id,
      userId: context.user.id,
      answers: readOnboardingAnswers(body),
      discoveryAnalysis: readOptionalDiscoveryAnalysis(body),
    });

    return ok(result);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}
