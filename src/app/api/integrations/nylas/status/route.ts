import { NextResponse } from "next/server";

import { db } from "../../../../../lib/db";
import {
  ExecutiveAuthenticationError,
  resolveAuthenticatedExecutiveContext
} from "../../../../../lib/auth/executive-session-context";
import { loadNylasConnection } from "../../../../../lib/integrations/nylas/nylas-connection";

export async function GET(request: Request) {
  try {
    const auth = await resolveAuthenticatedExecutiveContext(request);

    const connection = await db.integrationConnection.findUnique({
      where: {
        organizationId_provider: {
          organizationId: auth.organizationId,
          provider: "NYLAS"
        }
      },
      select: {
        status: true,
        lastSuccessfulSyncAt: true,
        lastErrorAt: true,
        lastErrorCode: true
      }
    });

    const connected = connection?.status === "CONNECTED";
    const info = connected
      ? await loadNylasConnection(auth.organizationId)
      : null;

    return NextResponse.json(
      {
        ok: true,
        connected,
        status: connection?.status ?? "DISCONNECTED",
        email: info?.email ?? null,
        provider: info?.provider ?? null,
        lastSuccessfulSyncAt:
          connection?.lastSuccessfulSyncAt?.toISOString() ?? null,
        lastErrorAt: connection?.lastErrorAt?.toISOString() ?? null,
        lastErrorCode: connection?.lastErrorCode ?? null
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ExecutiveAuthenticationError) {
      return NextResponse.json(
        { ok: false, code: error.code },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }

    throw error;
  }
}
