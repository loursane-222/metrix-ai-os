import { cookies } from "next/headers";

import { logoutAuth } from "@/lib/application/auth/auth.service";
import {
  AUTH_DEVICE_COOKIE,
  AUTH_SESSION_COOKIE,
} from "@/lib/auth/shared/auth.constants";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { buildClearCookieOptions } from "@/lib/auth/shared/cookies";
import { fail, ok } from "@/lib/api/response";

export async function POST(): Promise<Response> {
  try {
    const cookieStore = await cookies();

    await logoutAuth({
      sessionToken: cookieStore.get(AUTH_SESSION_COOKIE)?.value,
      trustedDeviceToken: cookieStore.get(AUTH_DEVICE_COOKIE)?.value,
    });

    cookieStore.set(AUTH_SESSION_COOKIE, "", buildClearCookieOptions());
    cookieStore.set(AUTH_DEVICE_COOKIE, "", buildClearCookieOptions());

    return ok({
      loggedOut: true,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }

    return fail("Unexpected error.");
  }
}
