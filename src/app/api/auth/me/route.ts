import { cookies } from "next/headers";

import { getCurrentAuthContext } from "@/lib/application/auth/auth.service";
import {
  AUTH_DEVICE_COOKIE,
  AUTH_SESSION_COOKIE,
} from "@/lib/auth/shared/auth.constants";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { fail, ok } from "@/lib/api/response";

export async function GET(): Promise<Response> {
  try {
    const cookieStore = await cookies();
    const context = await getCurrentAuthContext(
      cookieStore.get(AUTH_SESSION_COOKIE)?.value,
      cookieStore.get(AUTH_DEVICE_COOKIE)?.value,
    );

    return ok(context);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }

    return fail("Unexpected error.");
  }
}
