import { fail, ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { syncBizimHesapCatalog } from "@/lib/integrations/bizimhesap/bizimhesap.service";

export const maxDuration = 30;

export async function POST(): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const security = await authorizeLegacyMutation({ authContext: auth, actionName: "bizimhesap.sync", requiredPermission: "integrations.write", entityType: "IntegrationConnection" });
    const snapshot = await syncBizimHesapCatalog(auth.organization.id);
    await security.succeed();
    return ok(snapshot);
  } catch (error) {
    if (error instanceof Error && error.message === "BIZIMHESAP_NOT_CONNECTED") return fail("Bizim Hesap bağlantısı yok.", 409);
    if (error instanceof Error && error.message.startsWith("BIZIMHESAP_")) return fail("Bizim Hesap ile senkronizasyon başarısız oldu.", 502);
    return authFail(error);
  }
}
