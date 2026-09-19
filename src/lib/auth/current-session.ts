import { db } from "../db";
import {
  METRIX_SESSION_COOKIE,
  hashSessionToken,
  readCookie
} from "./executive-session-context";

export type CurrentSession = {
  userId: string;
  email: string;
  organizationId: string | null;
  organizationName: string | null;
};

/**
 * Unlike resolveAuthenticatedExecutiveContext, this never throws for a
 * missing organization — it is used by the session/organization-setup
 * boundary, which must work for a genuinely authenticated user who has
 * not created an organization yet.
 */
export async function resolveCurrentSession(
  request: Request
): Promise<CurrentSession | null> {
  const token = readCookie(request, METRIX_SESSION_COOKIE)?.trim();

  if (!token) {
    return null;
  }

  const now = new Date();

  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true }
  });

  if (
    !session ||
    session.revokedAt !== null ||
    session.expiresAt <= now
  ) {
    return null;
  }

  if (session.user.platformStatus !== "ACTIVE") return null;

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.userId },
    orderBy: { createdAt: "asc" },
    include: { organization: true }
  });

  await db.session.update({
    where: { id: session.id },
    data: { lastUsedAt: now }
  });

  return {
    userId: session.user.id,
    email: session.user.email,
    organizationId: membership?.organizationId ?? null,
    organizationName: membership?.organization.name ?? null
  };
}
