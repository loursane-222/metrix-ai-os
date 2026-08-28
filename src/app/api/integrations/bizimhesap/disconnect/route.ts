import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { disconnectBizimHesap } from "@/lib/integrations/bizimhesap/bizimhesap.service";

export async function DELETE(): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const security = await authorizeLegacyMutation({ authContext: auth, actionName: "bizimhesap.disconnect", requiredPermission: "integrations.write", entityType: "IntegrationConnection", entityId: auth.organization.id });
    await disconnectBizimHesap(auth.organization.id);
    await security.succeed();
    return ok({ disconnected: true });
  } catch (error) {
    return authFail(error);
  }
}
