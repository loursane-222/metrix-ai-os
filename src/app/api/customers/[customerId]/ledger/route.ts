import { fail, ok } from "@/lib/api/response";
import { getCustomerStatement } from "@/lib/accounting/customer-statement.service";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";

export async function GET(_request: Request, context: { params: Promise<{ customerId: string }> }): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const { customerId } = await context.params;
    const statement = await getCustomerStatement(auth.organization.id, customerId);
    return statement ? ok({ statement }) : fail("Customer not found.", 404);
  } catch (error: unknown) {
    return authFail(error);
  }
}
