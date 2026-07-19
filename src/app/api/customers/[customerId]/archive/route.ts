import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { archiveCustomerById } from "@/lib/core/customers/customer.service";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";

export async function POST(
  _request: Request,
  context: { params: Promise<{ customerId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { customerId } = await context.params;
    const security = authorizeLegacyMutation({ authContext, actionName: "customer.archive", requiredPermission: "customers.archive", entityType: "Customer", entityId: customerId });

    await archiveCustomerById(customerId, authContext.organization.id);
    security.succeed();

    return ok({ archived: true });
  } catch (error: unknown) {
    return authFail(error);
  }
}
