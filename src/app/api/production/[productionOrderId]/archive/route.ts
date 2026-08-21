import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { archiveProductionOrderById } from "@/lib/core/production/production.service";

export async function POST(_request: Request, context: { params: Promise<{ productionOrderId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { productionOrderId } = await context.params;
    await archiveProductionOrderById(productionOrderId, auth.organization.id);
    return ok({ archived: true });
  } catch (e) {
    return authFail(e);
  }
}
