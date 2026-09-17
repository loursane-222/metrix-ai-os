import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveCurrentSession } from "../../../lib/auth/current-session";
import {
  UserAlreadyHasOrganizationError,
  executeOrganizationCreate
} from "../../../lib/actions/organization-create";

const RequestSchema = z
  .object({
    organizationName: z.string().trim().min(1).max(200)
  })
  .strict();

function jsonNoStore(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function POST(request: Request) {
  const session = await resolveCurrentSession(request);

  if (!session) {
    return jsonNoStore({ ok: false, code: "UNAUTHENTICATED" }, 401);
  }

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
    const result = await executeOrganizationCreate({
      userId: session.userId,
      name: parsed.data.organizationName
    });

    return jsonNoStore(
      {
        ok: true,
        organization: {
          id: result.organizationId,
          name: result.organizationName
        }
      },
      200
    );
  } catch (error) {
    if (error instanceof UserAlreadyHasOrganizationError) {
      return jsonNoStore({ ok: false, code: error.code }, 409);
    }

    return jsonNoStore({ ok: false, code: "INVALID_REQUEST" }, 400);
  }
}
