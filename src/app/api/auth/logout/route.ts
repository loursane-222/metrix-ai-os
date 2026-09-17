import { NextResponse } from "next/server";

import { db } from "../../../../lib/db";
import {
  METRIX_SESSION_COOKIE,
  hashSessionToken,
  readCookie
} from "../../../../lib/auth/executive-session-context";
import { clearSessionCookieHeader } from "../../../../lib/auth/session-issuance";

export async function POST(request: Request) {
  const token = readCookie(request, METRIX_SESSION_COOKIE)?.trim();

  if (token) {
    await db.session.updateMany({
      where: { tokenHash: hashSessionToken(token), revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": clearSessionCookieHeader()
      }
    }
  );
}
