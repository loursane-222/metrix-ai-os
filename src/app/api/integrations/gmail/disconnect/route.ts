import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { disconnectGmail } from "@/lib/integrations/gmail/gmail.service";

export async function DELETE(request: Request): Promise<Response> {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? undefined;
    const auth = await requireAuthContextFromCookies(organizationId);
    await disconnectGmail(auth.organization.id, auth.user.id);
    return ok({ disconnected: true });
  } catch (error) {
    return authFail(error);
  }
}
