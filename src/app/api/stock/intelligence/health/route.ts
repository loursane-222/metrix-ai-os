import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { computeStockHealth } from "@/lib/core/stock/stock-intelligence.service";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const raw = new URL(request.url).searchParams.get("windowDays");
    const result = await computeStockHealth(auth.organization.id, raw ? Number(raw) : 90);
    return ok(result);
  } catch (error) {
    return authFail(error);
  }
}
