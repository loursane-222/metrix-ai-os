import { AuthError } from "@/lib/auth/shared/auth.errors";
import { requireSessionToken } from "@/lib/auth/sessions/session.service";
import { validateTrustedDeviceToken } from "@/lib/auth/trusted-devices/trusted-device.service";

import {
  findDefaultOrganizationContextByUserId,
  findOrganizationContextByUserId,
} from "./organization-context.repository";

import type {
  AuthContext,
  AuthTokens,
  CurrentOrganizationContext,
  CurrentSessionContext,
} from "./auth-context.types";
import type { User } from "@prisma/client";

export async function getCurrentSession(
  tokens: AuthTokens,
): Promise<CurrentSessionContext> {
  const validatedSession = await requireSessionToken(tokens.sessionToken);
  const trustedDeviceValid = await validateTrustedDeviceToken(
    tokens.trustedDeviceToken,
  );

  return {
    session: validatedSession,
    user: validatedSession.user,
    trustedDeviceValid,
  };
}

export async function getCurrentUser(tokens: AuthTokens): Promise<User> {
  const sessionContext = await getCurrentSession(tokens);

  return sessionContext.user;
}

export async function getCurrentOrganization(
  tokens: AuthTokens,
  organizationId?: string,
): Promise<CurrentOrganizationContext> {
  const sessionContext = await getCurrentSession(tokens);
  const organizationContext = organizationId
    ? await findOrganizationContextByUserId(
        sessionContext.user.id,
        organizationId,
      )
    : await findDefaultOrganizationContextByUserId(sessionContext.user.id);

  if (!organizationContext) {
    throw new AuthError("Organization membership was not found.", 403);
  }

  return organizationContext;
}

export async function getAuthContext(
  tokens: AuthTokens,
  organizationId?: string,
): Promise<AuthContext> {
  const sessionContext = await getCurrentSession(tokens);
  const organizationContext = organizationId
    ? await findOrganizationContextByUserId(
        sessionContext.user.id,
        organizationId,
      )
    : await findDefaultOrganizationContextByUserId(sessionContext.user.id);

  if (!organizationContext) {
    throw new AuthError("Organization membership was not found.", 403);
  }

  return {
    user: sessionContext.user,
    organization: organizationContext.organization,
    membership: organizationContext.membership,
    session: sessionContext.session,
  };
}
