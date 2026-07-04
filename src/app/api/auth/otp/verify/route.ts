import { cookies } from "next/headers";

import { verifyAuthOtp } from "@/lib/application/auth/auth.service";
import {
  AUTH_DEVICE_COOKIE,
  AUTH_SESSION_COOKIE,
} from "@/lib/auth/shared/auth.constants";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import {
  buildSessionCookieOptions,
  buildTrustedDeviceCookieOptions,
} from "@/lib/auth/shared/cookies";
import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  optionalBoolean,
  readJsonObject,
  requiredString,
} from "@/lib/api/validation";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const result = await verifyAuthOtp({
      phone: requiredString(body, "email"),
      code: requiredString(body, "code"),
      rememberMe: optionalBoolean(body, "rememberMe"),
      userAgent: request.headers.get("user-agent"),
    });
    const cookieStore = await cookies();

    cookieStore.set(
      AUTH_SESSION_COOKIE,
      result.sessionToken,
      buildSessionCookieOptions(result.rememberMe),
    );

    if (result.trustedDeviceToken) {
      cookieStore.set(
        AUTH_DEVICE_COOKIE,
        result.trustedDeviceToken,
        buildTrustedDeviceCookieOptions(),
      );
    }

    return ok({
      user: result.user,
      session: result.session,
      trustedDevice: result.trustedDevice,
      rememberMe: result.rememberMe,
      sessionExpiresAt: result.sessionExpiresAt,
    });
  } catch (error: unknown) {
    if (error instanceof ApiValidationError || error instanceof AuthError) {
      return fail(error.message, error instanceof AuthError ? error.status : 400);
    }

    return fail("Unexpected error.");
  }
}
