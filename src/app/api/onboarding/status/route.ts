import { requireAuthContextFromCookies, authFail } from "@/lib/auth/guards/api-auth-guard";
import { ok } from "@/lib/api/response";
import { buildOnboardingStatusResult } from "@/lib/onboarding/onboarding-experience.service";

export async function GET(): Promise<Response> {
  try {
    const context = await requireAuthContextFromCookies();

    return ok(buildOnboardingStatusResult(context));
  } catch (error: unknown) {
    return authFail(error);
  }
}
