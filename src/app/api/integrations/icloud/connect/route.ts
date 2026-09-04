import { fail, ok } from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { connectIcloudCalendar } from "@/lib/integrations/icloud-calendar/icloud-calendar.service";

/**
 * Per-user connection (unlike bizimhesap's org-wide connect route): each
 * user authorizes their own iCloud account with an app-specific password
 * they generate themselves at account.apple.com — never their primary
 * Apple Account password. connectIcloudCalendar verifies the credential via
 * a real CalDAV discovery request before ever storing it.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const security = await authorizeLegacyMutation({ authContext: auth, actionName: "icloud.connect", requiredPermission: "integrations.write", entityType: "IntegrationConnection" });
    const body = await readJsonObject(request);
    const appleId = typeof body.appleId === "string" ? body.appleId.trim() : "";
    const appSpecificPassword = typeof body.appSpecificPassword === "string" ? body.appSpecificPassword.trim() : "";
    if (!appleId) return fail("Apple ID gerekli.", 400);
    if (!appSpecificPassword) return fail("Uygulamaya özel parola gerekli. Normal Apple Account şifrenizi değil, account.apple.com üzerinden oluşturduğunuz uygulamaya özel parolayı girin.", 400);
    await connectIcloudCalendar({ organizationId: auth.organization.id, userId: auth.user.id, appleId, appSpecificPassword });
    await security.succeed();
    return ok({ connected: true });
  } catch (error) {
    if (error instanceof Error && error.message === "ICLOUD_AUTH_REQUIRED") {
      return fail("iCloud bağlantısı doğrulanamadı. Apple ID ve uygulamaya özel parolayı kontrol edin.", 422);
    }
    if (error instanceof Error && error.message.startsWith("ICLOUD_")) {
      return fail("iCloud takvimine şu anda ulaşılamıyor. Daha sonra tekrar deneyin.", 422);
    }
    return authFail(error);
  }
}
