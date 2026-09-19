import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ExecutiveAuthenticationError,
  resolveAuthenticatedExecutiveContext
} from "../../../../../lib/auth/executive-session-context";
import {
  BizimHesapConnectionFailedError,
  executeBizimHesapConnectWithFirstSync
} from "../../../../../lib/actions/bizimhesap-connect";
import { MissingEncryptionKeyError } from "../../../../../lib/integrations/credential-crypto";

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

    // Connect and the first sync are one lifecycle; the response reports
    // the two outcomes separately and never echoes the credential.
    const result = await executeBizimHesapConnectWithFirstSync({
      actorUserId: auth.actorUserId,
      organizationId: auth.organizationId,
      token: parsed.data.token,
      firmId: parsed.data.firmId
    });

    return jsonNoStore(
      {
        ok: true,
        status: result.status,
        sync:
          result.firstSync.status === "SYNCED"
            ? {
                status: "SYNCED",
                products:
                  result.firstSync.result.productsCreated +
                  result.firstSync.result.productsUpdated,
                warehouses:
                  result.firstSync.result.locationsCreated +
                  result.firstSync.result.locationsUpdated
              }
            : { status: "SYNC_FAILED" }
      },
      200
    );
  } catch (error) {
    if (error instanceof ExecutiveAuthenticationError) {
      return jsonNoStore({ ok: false, code: error.code }, error.status);
    }

    // The only deployment prerequisite left is the credential encryption
    // key; BizimHesap's own B2B Key is a fixed protocol constant.
    if (error instanceof MissingEncryptionKeyError) {
      return jsonNoStore({ ok: false, code: error.code }, 503);
    }

    if (error instanceof BizimHesapConnectionFailedError) {
      return jsonNoStore(
        { ok: false, code: error.code },
        error.reason === "CREDENTIALS_REJECTED" ? 422 : 502
      );
    }

    // Never rethrow: the framework would log the failure with request
    // context. Only a fixed code leaves this route.
    return jsonNoStore({ ok: false, code: "BIZIMHESAP_CONNECT_FAILED" }, 500);
  }
}
