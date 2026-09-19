import { NextResponse } from "next/server";
import { z } from "zod";

import {
  InvalidOtpError,
  AccessNotApprovedError,
  verifyLoginOtp
} from "../../../../../lib/actions/auth-login";
import { sessionCookieHeader } from "../../../../../lib/auth/session-issuance";

const RequestSchema = z
  .object({
    email: z.string().trim().min(1).max(320),
    code: z.string().trim().min(1).max(32)
  })
  .strict();

function jsonNoStore(
  body: unknown,
  status: number,
  extraHeaders?: Record<string, string>
) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...extraHeaders }
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ ok: false, code: "INVALID_JSON" }, 400);
  }

  const parsed = RequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonNoStore({ ok: false, code: "INVALID_REQUEST" }, 400);
  }

  try {
    const result = await verifyLoginOtp({
      email: parsed.data.email,
      code: parsed.data.code
    });

    return jsonNoStore(
      {
        ok: true,
        needsOrganization: result.needsOrganization
      },
      200,
      {
        "Set-Cookie": sessionCookieHeader(
          result.sessionToken,
          result.sessionExpiresAt
        )
      }
    );
  } catch (error) {
    if (error instanceof InvalidOtpError) {
      return jsonNoStore({ ok: false, code: error.code }, 401);
    }

    if (error instanceof AccessNotApprovedError) {
      return jsonNoStore({ ok: false, code: error.code }, 403);
    }

    return jsonNoStore({ ok: false, code: "INVALID_REQUEST" }, 400);
  }
}
