import { fail, ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { archiveCustomerById } from "@/lib/core/customers/customer.service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ customerId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { customerId } = await context.params;

    await archiveCustomerById(customerId, authContext.organization.id);

    return ok({ archived: true });
  } catch (error: unknown) {
    return authFail(error);
  }
}
