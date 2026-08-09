import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, ApiValidationError } from "@/lib/api/validation";
import { listStock, receiveStock } from "@/lib/core/stock/stock.service";
import { serializeStock } from "@/lib/core/stock/stock.serializer";

export async function GET() {
  try {
    const auth = await requireAuthContextFromCookies();
    const stocks = await listStock({ organizationId: auth.organization.id });
    return ok({ stocks: stocks.map((s) => serializeStock(s)), count: stocks.length });
  } catch (e) {
    return authFail(e);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const productServiceId = optionalString(body, "productServiceId");
    const warehouseId = optionalString(body, "warehouseId");
    const quantityRaw = (body as Record<string, unknown>).quantity;
    if (!productServiceId) return fail("productServiceId is required.", 400);
    if (!warehouseId) return fail("warehouseId is required.", 400);
    if (typeof quantityRaw !== "number" || quantityRaw <= 0) return fail("quantity must be a positive number.", 400);

    const stock = await receiveStock({
      organizationId: auth.organization.id,
      productServiceId,
      warehouseId,
      quantity: quantityRaw,
      location: optionalString(body, "location"),
      lot: optionalString(body, "lot"),
      batch: optionalString(body, "batch"),
      serialNumber: optionalString(body, "serialNumber"),
      reason: optionalString(body, "reason"),
    });
    return ok({ stock: serializeStock(stock) }, 201);
  } catch (e) {
    if (e instanceof ApiValidationError) return fail(e.message, 400);
    return authFail(e);
  }
}
