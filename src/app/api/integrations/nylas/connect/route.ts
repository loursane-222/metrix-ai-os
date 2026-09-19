import { NextResponse } from "next/server";

import {
  ExecutiveAuthenticationError,
  resolveAuthenticatedExecutiveContext
} from "../../../../../lib/auth/executive-session-context";
import {
  MissingNylasCredentialsError,
  buildNylasHostedAuthUrl
} from "../../../../../lib/integrations/nylas/nylas-client";
import { nylasCallbackUrl } from "../../../../../lib/integrations/nylas/nylas-redirect";

/**
 * Initiates Nylas Hosted Authentication: redirects the already-
 * authenticated browser to Nylas's own consent screen. `state` carries
 * the organizationId so the callback can cross-check it against the
 * session's own organization — defense in depth, not the sole boundary
 * (the callback re-authenticates the session independently).
 */
export async function GET(request: Request) {
  try {
    const auth = await resolveAuthenticatedExecutiveContext(request);

    const provider = new URL(request.url).searchParams.get("provider");

    const url = buildNylasHostedAuthUrl({
      redirectUri: nylasCallbackUrl(request),
      // The connect card is "Google Hesabını Bağla" and Gmail/Google
      // Calendar is the only supported account type, so default straight
      // to Google. Without a provider Nylas first shows its own provider
      // picker page — an extra, Nylas-branded screen the user never
      // needs to see.
      provider:
        provider === "google" || provider === "microsoft"
          ? provider
          : "google",
      state: auth.organizationId
    });

    return NextResponse.redirect(url, { status: 302 });
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

    throw error;
  }
}
