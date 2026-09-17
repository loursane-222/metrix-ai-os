import { NextResponse } from "next/server";

import {
  ExecutiveAuthenticationError,
  resolveAuthenticatedExecutiveContext
} from "../../../../../lib/auth/executive-session-context";
import {
  BizimHesapNotConnectedError,
  BizimHesapSyncFailedError,
  executeBizimHesapSync
} from "../../../../../lib/actions/bizimhesap-sync";

function jsonNoStore(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function POST(request: Request) {
  try {
    const auth = await resolveAuthenticatedExecutiveContext(request);

    const result = await executeBizimHesapSync({
      actorUserId: auth.actorUserId,
      organizationId: auth.organizationId
    });

    return jsonNoStore({ ok: true, result }, 200);
  } catch (error) {
    if (error instanceof ExecutiveAuthenticationError) {
      return jsonNoStore({ ok: false, code: error.code }, error.status);
    }

    if (error instanceof BizimHesapNotConnectedError) {
      return jsonNoStore({ ok: false, code: error.code }, 409);
    }

    if (error instanceof BizimHesapSyncFailedError) {
      return jsonNoStore({ ok: false, code: error.code }, 502);
    }

    throw error;
  }
}
