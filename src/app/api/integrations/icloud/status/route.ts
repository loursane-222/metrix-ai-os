import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { getIcloudCalendarStatus } from "@/lib/integrations/icloud-calendar/icloud-calendar.service";

export async function GET(request: Request): Promise<Response> {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? undefined;
    const auth = await requireAuthContextFromCookies(organizationId);
    return ok(await getIcloudCalendarStatus(auth.organization.id, auth.user.id));
  } catch (error) {
    return authFail(error);
  }
}
