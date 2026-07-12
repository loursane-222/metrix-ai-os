import { cookies } from "next/headers";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readOAuthStateContext, verifyOAuthState } from "@/lib/integrations/gmail/gmail-oauth.service";
import { connectGmail, exchangeOAuthCode } from "@/lib/integrations/gmail/gmail.service";

const STATE_COOKIE = "metrix_gmail_oauth_state";

function accountingRedirect(request: Request, result: string): Response {
  return Response.redirect(new URL(`/metrix/accounting?gmail=${result}`, request.url));
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  try {
    const context = readOAuthStateContext(state);
    if (!context || !code) return accountingRedirect(request, "invalid_state");
    const auth = await requireAuthContextFromCookies(context.organizationId);
    const cookieStore = await cookies();
    const cookieState = cookieStore.get(STATE_COOKIE)?.value;
    cookieStore.delete(STATE_COOKIE);
    if (cookieState !== state || !verifyOAuthState(state, auth.user.id, auth.organization.id)) return accountingRedirect(request, "invalid_state");
    const tokens = await exchangeOAuthCode(code);
    await connectGmail({ organizationId: auth.organization.id, userId: auth.user.id, tokens });
    return accountingRedirect(request, "connected");
  } catch (error) {
    if (error instanceof Error && error.message.includes("Organization membership")) return authFail(error);
    return accountingRedirect(request, "failed");
  }
}
