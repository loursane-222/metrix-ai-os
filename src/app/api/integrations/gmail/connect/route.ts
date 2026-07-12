import { cookies } from "next/headers";
import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { buildGoogleAuthorizationUrl, createOAuthState } from "@/lib/integrations/gmail/gmail-oauth.service";

const STATE_COOKIE = "metrix_gmail_oauth_state";

export async function POST(request: Request): Promise<Response> {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? undefined;
    const auth = await requireAuthContextFromCookies(organizationId);
    const state = createOAuthState(auth.user.id, auth.organization.id);
    const cookieStore = await cookies();
    cookieStore.set(STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/integrations/gmail/callback", maxAge: 600 });
    return ok({ authorizationUrl: buildGoogleAuthorizationUrl(state) });
  } catch (error) {
    return authFail(error);
  }
}
