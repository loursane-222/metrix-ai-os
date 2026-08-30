import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { listFinancialAccounts } from "@/lib/financial-accounts";

/**
 * Thin, read-only wrapper over listFinancialAccounts — needed so a caller
 * (e.g. the payment.apply method/account picker) can resolve which
 * FinancialAccount a settlement should reference. No new domain logic; no
 * mutation. This is not a Finance Workspace/dashboard surface.
 */
export async function GET(): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const accounts = await listFinancialAccounts(authContext.organization.id);
    return ok({ financialAccounts: accounts });
  } catch (error: unknown) {
    return authFail(error);
  }
}
