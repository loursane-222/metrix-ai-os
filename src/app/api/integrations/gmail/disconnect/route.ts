import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { disconnectGmail } from "@/lib/integrations/gmail/gmail.service";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";

export async function DELETE(): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const security = authorizeLegacyMutation({ authContext: auth, actionName: "gmail.disconnect", requiredPermission: "integrations.write", entityType: "GmailIntegration", entityId: auth.organization.id });
    await disconnectGmail(auth.organization.id, auth.user.id);
    security.succeed();
    return ok({ disconnected: true });
  } catch (error) {
    return authFail(error);
  }
}
