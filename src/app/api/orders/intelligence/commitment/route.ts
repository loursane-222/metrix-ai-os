import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { computeDeliveryCommitmentRate } from "@/lib/core/orders/order-intelligence.service";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const raw = new URL(request.url).searchParams.get("windowDays");
    const windowDays = raw ? Number(raw) : 90;
    const result = await computeDeliveryCommitmentRate(auth.organization.id, Number.isInteger(windowDays) && windowDays > 0 ? windowDays : 90);
    return ok(result);
  } catch (error) {
    return authFail(error);
  }
}
