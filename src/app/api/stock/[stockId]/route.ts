import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { getStockByIdForOrganization } from "@/lib/core/stock/stock.service";
import { serializeStock } from "@/lib/core/stock/stock.serializer";

export async function GET(_request: Request, { params }: { params: Promise<{ stockId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { stockId } = await params;
    const stock = await getStockByIdForOrganization(stockId, auth.organization.id);
    if (!stock) return fail("Stock not found.", 404);
    return ok({ stock: serializeStock(stock) });
  } catch (e) {
    return authFail(e);
  }
}
