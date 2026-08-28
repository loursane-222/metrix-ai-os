import { fail, ok } from "@/lib/api/response";
import { ApiValidationError, optionalString, readJsonObject } from "@/lib/api/validation";
import { authFail, requireCurrentUserFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { UpdateUserProfileValidationError, updateUserProfile } from "@/lib/core/users/user.service";

function serializeUser(user: { id: string; fullName: string | null; email: string | null; avatarUrl: string | null; phone: string; timezone: string; language: string; voicePreference: string | null }) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    timezone: user.timezone,
    language: user.language,
    voicePreference: user.voicePreference,
  };
}

export async function GET(): Promise<Response> {
  try {
    const user = await requireCurrentUserFromCookies();
    return ok({ user: serializeUser(user) });
  } catch (error: unknown) {
    return authFail(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const user = await requireCurrentUserFromCookies();
    const body = await readJsonObject(request);

    const updated = await updateUserProfile(user.id, {
      fullName: optionalString(body, "fullName"),
      email: optionalString(body, "email"),
      timezone: optionalString(body, "timezone"),
      voicePreference: optionalString(body, "voicePreference"),
    });

    return ok({ user: serializeUser(updated) });
  } catch (error: unknown) {
    if (error instanceof ApiValidationError || error instanceof UpdateUserProfileValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}
