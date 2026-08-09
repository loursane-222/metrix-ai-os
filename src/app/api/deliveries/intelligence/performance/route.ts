import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { computeDeliveryPerformance } from "@/lib/core/deliveries/delivery-intelligence.service";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const raw = new URL(request.url).searchParams.get("windowDays");
    const windowDays = raw ? Number(raw) : 90;
    return ok(await computeDeliveryPerformance(auth.organization.id, Number.isInteger(windowDays) && windowDays > 0 ? windowDays : 90));
  } catch (error) { return authFail(error); }
}
