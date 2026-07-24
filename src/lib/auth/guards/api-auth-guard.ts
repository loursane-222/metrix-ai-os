import { cookies } from "next/headers";
import { after } from "next/server";

import {
  getAuthContext,
  getCurrentOrganization,
  getCurrentSession,
  getCurrentUser,
} from "@/lib/auth/context/auth-context.service";
import type {
  AuthContext,
  AuthTokens,
  CurrentOrganizationContext,
  CurrentSessionContext,
} from "@/lib/auth/context/auth-context.types";
import {
  AUTH_DEVICE_COOKIE,
  AUTH_SESSION_COOKIE,
} from "@/lib/auth/shared/auth.constants";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { fail } from "@/lib/api/response";

export async function readAuthTokensFromCookies(): Promise<AuthTokens> {
  const cookieStore = await cookies();

  return {
    sessionToken: cookieStore.get(AUTH_SESSION_COOKIE)?.value,
    trustedDeviceToken: cookieStore.get(AUTH_DEVICE_COOKIE)?.value,
  };
}

export async function requireCurrentSessionFromCookies(): Promise<CurrentSessionContext> {
  return getCurrentSession(await readAuthTokensFromCookies());
}

export async function requireCurrentUserFromCookies() {
  return getCurrentUser(await readAuthTokensFromCookies());
}

export async function requireCurrentOrganizationFromCookies(
  organizationId?: string,
): Promise<CurrentOrganizationContext> {
  return getCurrentOrganization(await readAuthTokensFromCookies(), organizationId);
}

export async function requireAuthContextFromCookies(
  organizationId?: string,
  telemetry?: {
    requestId: string;
    requestStartAt: number;
  },
): Promise<AuthContext> {
  return getAuthContext(
    await readAuthTokensFromCookies(),
    organizationId,
    (task) => {
      after(async () => {
        const startedAt = performance.now();
        await task();
        if (telemetry) {
          console.info("[api/ai/chat][latency]", {
            label: "auth_touch_write_done",
            requestId: telemetry.requestId,
            elapsedMs: Math.round(performance.now() - telemetry.requestStartAt),
            segmentMs: Math.round(performance.now() - startedAt),
            at: performance.now(),
          });
        }
      });
    },
  );
}

export function authFail(error: unknown): Response {
  if (error instanceof AuthError) {
    return fail(error.message, error.status);
  }

  return fail("Unexpected error.");
}
