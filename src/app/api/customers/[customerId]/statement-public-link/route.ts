import { fail, ok } from "@/lib/api/response";
import { ApiValidationError } from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { ensurePublicStatementToken } from "@/lib/accounting/customer-statement-public-link.service";
import { getCustomerStatement } from "@/lib/accounting/customer-statement.service";
import { prisma } from "@/lib/core/shared/prisma";

export async function POST(request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { customerId } = await params;
    const customer = await prisma.customer.findFirst({ where: { id: customerId, organizationId: auth.organization.id }, select: { id: true, displayName: true, phone: true } });
    if (!customer) return fail("Customer not found.", 404);
    const [token, statement] = await Promise.all([
      ensurePublicStatementToken(customerId, auth.organization.id),
      getCustomerStatement(auth.organization.id, customerId),
    ]);
    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/u, "");
    const origin = configuredOrigin || new URL(request.url).origin;
    return ok({
      publicUrl: `${origin}/mutabakat/${token}`,
      organizationName: auth.organization.name,
      customer: { id: customer.id, displayName: customer.displayName, phone: customer.phone },
      balances: statement?.balances ?? [],
    });
  } catch (error) {
    if (error instanceof ApiValidationError) return fail(error.message, error.status);
    return authFail(error);
  }
}
