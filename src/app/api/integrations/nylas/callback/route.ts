import { NextResponse } from "next/server";

import {
  ExecutiveAuthenticationError,
  resolveAuthenticatedExecutiveContext
} from "../../../../../lib/auth/executive-session-context";
import {
  NylasConnectionFailedError,
  executeNylasConnect
} from "../../../../../lib/actions/nylas-connect";
import { MissingNylasCredentialsError } from "../../../../../lib/integrations/nylas/nylas-client";
import { nylasCallbackUrl } from "../../../../../lib/integrations/nylas/nylas-redirect";

function redirectToMetrix(request: Request, status: "connected" | "error") {
  const url = new URL("/metrix", request.url);
  url.searchParams.set("nylas", status);
  return NextResponse.redirect(url, { status: 302 });
}

export async function GET(request: Request) {
  try {
    const auth = await resolveAuthenticatedExecutiveContext(request);

    const params = new URL(request.url).searchParams;
    const code = params.get("code");
    const state = params.get("state");

    if (!code || state !== auth.organizationId) {
      return redirectToMetrix(request, "error");
    }

    await executeNylasConnect({
      actorUserId: auth.actorUserId,
      organizationId: auth.organizationId,
      code,
      redirectUri: nylasCallbackUrl(request)
    });

    return redirectToMetrix(request, "connected");
  } catch (error) {
    if (error instanceof ExecutiveAuthenticationError) {
      return NextResponse.json(
        { ok: false, code: error.code },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (error instanceof MissingNylasCredentialsError) {
      return NextResponse.json(
        { ok: false, code: error.code },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (error instanceof NylasConnectionFailedError) {
      return redirectToMetrix(request, "error");
    }

    throw error;
  }
}
