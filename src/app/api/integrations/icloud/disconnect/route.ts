import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { disconnectIcloudCalendar } from "@/lib/integrations/icloud-calendar/icloud-calendar.service";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";

export async function DELETE(): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const security = await authorizeLegacyMutation({ authContext: auth, actionName: "icloud.disconnect", requiredPermission: "integrations.write", entityType: "IntegrationConnection", entityId: auth.organization.id });
    await disconnectIcloudCalendar(auth.organization.id, auth.user.id);
    await security.succeed();
    return ok({ disconnected: true });
  } catch (error) {
    return authFail(error);
  }
}
