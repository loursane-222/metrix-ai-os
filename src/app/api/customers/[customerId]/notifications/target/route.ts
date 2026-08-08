import { readJsonObject, requiredString } from "@/lib/api/validation";
import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { notifyCreatedCustomerTarget } from "@/lib/customers/customer-created-notification-target.service";

export async function POST(request: Request, context: { params: Promise<{ customerId: string }> }): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const { customerId } = await context.params;
    const security = authorizeLegacyMutation({ authContext: auth, actionName: "notification.create", requiredPermission: "notifications.write", entityType: "Customer", entityId: customerId });
    const body = await readJsonObject(request);
    const result = await notifyCreatedCustomerTarget({ organizationId: auth.organization.id, actorUserId: auth.user.id, customerId, target: requiredString(body, "target") });
    if (result.status === "DELIVERED") security.succeed(customerId);
    return ok(result);
  } catch (error) {
    return authFail(error);
  }
}
