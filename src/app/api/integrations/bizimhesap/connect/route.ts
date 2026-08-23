import { fail, ok } from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { connectBizimHesap } from "@/lib/integrations/bizimhesap/bizimhesap.service";

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const security = authorizeLegacyMutation({ authContext: auth, actionName: "bizimhesap.connect", requiredPermission: "integrations.write", entityType: "IntegrationConnection" });
    const body = await readJsonObject(request);
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const firmId = typeof body.firmId === "string" && body.firmId.trim() ? body.firmId.trim() : undefined;
    if (!token) return fail("Bizim Hesap token'ı gerekli.", 400);
    await connectBizimHesap({ organizationId: auth.organization.id, credentials: { token, firmId } });
    security.succeed();
    return ok({ connected: true });
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("BIZIMHESAP_") || error.message === "BIZIMHESAP_TOKEN_MISSING")) {
      return fail("Bizim Hesap bağlantısı doğrulanamadı. Token'ı kontrol edin.", 422);
    }
    return authFail(error);
  }
}
