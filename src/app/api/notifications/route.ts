import { fail, ok } from "@/lib/api/response";
import { ApiValidationError, optionalString, readJsonObject, requiredString } from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { getUnreadNotificationCount, listNotifications, notify } from "@/lib/core/notifications";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import type { NotificationSeverity } from "@prisma/client";

const NOTIFICATION_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const satisfies readonly NotificationSeverity[];

export async function GET(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const unreadOnly = new URL(request.url).searchParams.get("unreadOnly") === "true";

    const notifications = await listNotifications({
      organizationId: authContext.organization.id,
      recipientUserId: authContext.user.id,
      unreadOnly,
    });
    const unreadCount = await getUnreadNotificationCount(authContext.organization.id, authContext.user.id);

    return ok({ notifications, count: notifications.length, unreadCount });
  } catch (error: unknown) {
    return authFail(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const security = authorizeLegacyMutation({ authContext, actionName: "notification.create", requiredPermission: "notifications.write", entityType: "Notification" });
    const body = await readJsonObject(request);

    const rawSeverity = optionalString(body, "severity");
    if (rawSeverity !== undefined && !(NOTIFICATION_SEVERITIES as readonly string[]).includes(rawSeverity)) {
      return fail("severity is invalid.", 400);
    }

    const notification = await notify({
      organizationId: authContext.organization.id,
      recipientUserId: optionalString(body, "recipientUserId"),
      type: requiredString(body, "type"),
      title: requiredString(body, "title"),
      body: optionalString(body, "body"),
      severity: rawSeverity as NotificationSeverity | undefined,
      entityType: optionalString(body, "entityType"),
      entityId: optionalString(body, "entityId"),
    });
    security.succeed(notification.id);

    return ok({ notification }, 201);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, error.status);
    }

    return authFail(error);
  }
}
