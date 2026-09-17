import { randomBytes } from "node:crypto";

import { db } from "../db";
import {
  METRIX_SESSION_COOKIE,
  hashSessionToken
} from "./executive-session-context";

const REMEMBER_ME_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SHORT_TTL_MS = 24 * 60 * 60 * 1000;

export async function issueSession(
  input: { userId: string; rememberMe: boolean }
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() +
      (input.rememberMe ? REMEMBER_ME_TTL_MS : SHORT_TTL_MS)
  );

  await db.session.create({
    data: {
      userId: input.userId,
      tokenHash: hashSessionToken(token),
      rememberMe: input.rememberMe,
      expiresAt
    }
  });

  return { token, expiresAt };
}

export function sessionCookieHeader(
  token: string,
  expiresAt: Date
): string {
  const secure =
    process.env.NODE_ENV === "production" ? "; Secure" : "";

  return (
    `${METRIX_SESSION_COOKIE}=${token}; Path=/; HttpOnly; ` +
    `SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`
  );
}

export function clearSessionCookieHeader(): string {
  return `${METRIX_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
