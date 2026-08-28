import { fail, ok } from "@/lib/api/response";
import { ApiValidationError } from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { markNotificationAsRead } from "@/lib/core/notifications";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ notificationId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { notificationId } = await params;
    const security = await authorizeLegacyMutation({ authContext, actionName: "notification.read", requiredPermission: "notifications.write", entityType: "Notification", entityId: notificationId });

    const notification = await markNotificationAsRead(authContext.organization.id, notificationId);
    await security.succeed(notification.id);

    return ok({ notification });
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, error.status);
    }

    return authFail(error);
  }
}
