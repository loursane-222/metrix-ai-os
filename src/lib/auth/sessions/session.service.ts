import {
  REMEMBER_ME_SESSION_DAYS,
  SHORT_SESSION_HOURS,
} from "@/lib/auth/shared/auth.constants";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { generateSecureToken, hashSecret } from "@/lib/auth/shared/crypto";
import { addDays, addHours } from "@/lib/auth/shared/date";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";

import {
  createSessionRecord,
  findSessionByTokenHash,
  revokeSessionByTokenHash,
  touchSessionRecord,
} from "./session.repository";

import type { CreatedSession, ValidatedSession } from "./session.types";

export function getSessionExpiresAt(rememberMe: boolean): Date {
  const now = new Date();

  if (rememberMe) {
    return addDays(now, REMEMBER_ME_SESSION_DAYS);
  }

  return addHours(now, SHORT_SESSION_HOURS);
}

export async function createSession(
  userId: string,
  rememberMe: boolean,
  tx?: PrismaTransactionClient,
): Promise<CreatedSession> {
  const token = generateSecureToken();
  const session = await createSessionRecord(
    {
      userId,
      tokenHash: hashSecret(token),
      rememberMe,
      expiresAt: getSessionExpiresAt(rememberMe),
    },
    tx,
  );

  return {
    session,
    token,
  };
}

export async function validateSessionToken(
  token: string | undefined,
): Promise<ValidatedSession | null> {
  if (!token) {
    return null;
  }

  const record = await findSessionByTokenHash(hashSecret(token));

  if (!record || record.revokedAt || record.expiresAt <= new Date()) {
    return null;
  }

  await touchSessionRecord(record.id);

  return record;
}

export async function requireSessionToken(
  token: string | undefined,
): Promise<ValidatedSession> {
  const session = await validateSessionToken(token);

  if (!session) {
    throw new AuthError("Session is invalid or expired.", 401);
  }

  return session;
}

export async function revokeSessionToken(
  token: string | undefined,
): Promise<void> {
  if (!token) {
    return;
  }

  await revokeSessionByTokenHash(hashSecret(token));
}
