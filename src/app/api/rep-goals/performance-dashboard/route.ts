import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { resolvePerformanceDashboard } from "@/lib/rep-goals/performance-dashboard.service";

export async function GET(): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const dashboard = await resolvePerformanceDashboard(authContext);
    return ok({ dashboard });
  } catch (error) {
    return authFail(error);
  }
}
