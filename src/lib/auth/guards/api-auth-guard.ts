import { cookies } from "next/headers";

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
): Promise<AuthContext> {
  return getAuthContext(await readAuthTokensFromCookies(), organizationId);
}

export function authFail(error: unknown): Response {
  if (error instanceof AuthError) {
    return fail(error.message, error.status);
  }

  return fail("Unexpected error.");
}
