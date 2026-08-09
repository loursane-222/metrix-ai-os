import { ok } from "@/lib/api/response";
import { getAccountingSummary } from "@/lib/accounting/accounting-summary";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { buildExpenseContextForOrganization, buildExpenseIntelligence } from "@/lib/core/expenses";
import { buildPaymentContextForOrganization } from "@/lib/core/payments/payment-context-builder";
import { buildPaymentIntelligence } from "@/lib/core/payments/payment-intelligence-builder";
import { buildFinancialHealthIntelligence } from "@/lib/financial-health-intelligence";

export async function GET(): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const organizationId = auth.organization.id;
    const [accountingSummary, expenseContext, paymentContext] = await Promise.all([
      getAccountingSummary(organizationId), buildExpenseContextForOrganization(organizationId), buildPaymentContextForOrganization(organizationId),
    ]);
    const expenseIntelligence = buildExpenseIntelligence(expenseContext);
    const paymentIntelligence = buildPaymentIntelligence(paymentContext);
    const financialHealthIntelligence = buildFinancialHealthIntelligence({ expenseContext, expenseIntelligence, paymentContext, paymentIntelligence });
    return ok({ summary: { accountingSummary, expenseContext, expenseIntelligence, financialHealthIntelligence } });
  } catch (error: unknown) { return authFail(error); }
}
