import { db } from "../db";
import { hashSessionToken, METRIX_SESSION_COOKIE, readCookie } from "../auth/executive-session-context";

export class PlatformAdminDeniedError extends Error {
  readonly code = "PLATFORM_ADMIN_REQUIRED";
  constructor() { super("Platform administrator access is required"); }
}

export async function requirePlatformAdmin(request: Request): Promise<{ userId: string; email: string }> {
  const token = readCookie(request, METRIX_SESSION_COOKIE)?.trim();
  if (!token) throw new PlatformAdminDeniedError();
  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) }, include: { user: true }
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.platformRole !== "ADMIN" || session.user.platformStatus !== "ACTIVE") {
    throw new PlatformAdminDeniedError();
  }
  return { userId: session.userId, email: session.user.email };
}
