import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ExecutiveAuthenticationError,
  resolveAuthenticatedExecutiveContext
} from "../../../../../lib/auth/executive-session-context";
import {
  BizimHesapConnectionFailedError,
  executeBizimHesapConnect
} from "../../../../../lib/actions/bizimhesap-connect";
import { MissingPartnerKeyError } from "../../../../../lib/integrations/bizimhesap/bizimhesap-client";

const RequestSchema = z
  .object({
    token: z.string().trim().min(1),
    firmId: z.string().trim().min(1).optional()
  })
  .strict();

function jsonNoStore(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function POST(request: Request) {
  try {
    const auth = await resolveAuthenticatedExecutiveContext(request);

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

    const result = await executeBizimHesapConnect({
      actorUserId: auth.actorUserId,
      organizationId: auth.organizationId,
      token: parsed.data.token,
      firmId: parsed.data.firmId
    });

    return jsonNoStore({ ok: true, status: result.status }, 200);
  } catch (error) {
    if (error instanceof ExecutiveAuthenticationError) {
      return jsonNoStore({ ok: false, code: error.code }, error.status);
    }

    if (error instanceof MissingPartnerKeyError) {
      return jsonNoStore({ ok: false, code: error.code }, 503);
    }

    if (error instanceof BizimHesapConnectionFailedError) {
      return jsonNoStore({ ok: false, code: error.code }, 502);
    }

    throw error;
  }
}
