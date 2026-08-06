import { ok } from "@/lib/api/response";
import { getAccountingSummary } from "@/lib/accounting/accounting-summary";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";

export async function GET(): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    return ok({ summary: await getAccountingSummary(auth.organization.id) });
  } catch (error: unknown) {
    return authFail(error);
  }
}
