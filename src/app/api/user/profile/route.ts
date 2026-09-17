import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "../../../../lib/db";
import {
  ExecutiveAuthenticationError,
  resolveAuthenticatedExecutiveContext
} from "../../../../lib/auth/executive-session-context";

function jsonNoStore(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

const PatchSchema = z
  .object({
    fullName: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(320).optional(),
    timezone: z.string().trim().min(1).max(100).optional()
  })
  .strict();

export async function GET(request: Request) {
  try {
    const auth = await resolveAuthenticatedExecutiveContext(request);

    const user = await db.user.findUniqueOrThrow({
      where: { id: auth.actorUserId },
      select: { name: true, email: true, timezone: true }
    });

    return jsonNoStore(
      {
        ok: true,
        data: {
          user: {
            fullName: user.name,
            email: user.email,
            timezone: user.timezone
          }
        }
      },
      200
    );
  } catch (error) {
    if (error instanceof ExecutiveAuthenticationError) {
      return jsonNoStore({ ok: false, code: error.code }, error.status);
    }

    throw error;
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await resolveAuthenticatedExecutiveContext(request);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonNoStore({ ok: false, code: "INVALID_JSON" }, 400);
    }

    const parsed = PatchSchema.safeParse(body);

    if (!parsed.success) {
      return jsonNoStore({ ok: false, code: "INVALID_REQUEST" }, 400);
    }

    await db.user.update({
      where: { id: auth.actorUserId },
      data: {
        ...(parsed.data.fullName !== undefined ? { name: parsed.data.fullName } : {}),
        ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
        ...(parsed.data.timezone !== undefined ? { timezone: parsed.data.timezone } : {})
      }
    });

    return jsonNoStore({ ok: true }, 200);
  } catch (error) {
    if (error instanceof ExecutiveAuthenticationError) {
      return jsonNoStore({ ok: false, code: error.code }, error.status);
    }

    throw error;
  }
}
