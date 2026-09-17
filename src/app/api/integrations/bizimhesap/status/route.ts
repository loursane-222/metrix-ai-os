import { NextResponse } from "next/server";

import { db } from "../../../../../lib/db";
import {
  ExecutiveAuthenticationError,
  resolveAuthenticatedExecutiveContext
} from "../../../../../lib/auth/executive-session-context";

export async function GET(request: Request) {
  try {
    const auth = await resolveAuthenticatedExecutiveContext(request);

    const connection = await db.integrationConnection.findUnique({
      where: {
        organizationId_provider: {
          organizationId: auth.organizationId,
          provider: "BIZIMHESAP"
        }
      },
      select: {
        status: true,
        lastSuccessfulSyncAt: true,
        lastErrorAt: true,
        lastErrorCode: true
      }
    });

    return NextResponse.json(
      {
        ok: true,
        connected: connection?.status === "CONNECTED",
        status: connection?.status ?? "DISCONNECTED",
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
