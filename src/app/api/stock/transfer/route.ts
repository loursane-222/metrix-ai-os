import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, ApiValidationError } from "@/lib/api/validation";
import { transferStock } from "@/lib/core/stock/stock.service";
import { serializeStock } from "@/lib/core/stock/stock.serializer";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const productServiceId = optionalString(body, "productServiceId");
    const fromWarehouseId = optionalString(body, "fromWarehouseId");
    const toWarehouseId = optionalString(body, "toWarehouseId");
    const quantityRaw = (body as Record<string, unknown>).quantity;
    if (!productServiceId) return fail("productServiceId is required.", 400);
    if (!fromWarehouseId) return fail("fromWarehouseId is required.", 400);
    if (!toWarehouseId) return fail("toWarehouseId is required.", 400);
    if (typeof quantityRaw !== "number" || quantityRaw <= 0) return fail("quantity must be a positive number.", 400);

    const result = await transferStock({
      organizationId: auth.organization.id,
      productServiceId,
      fromWarehouseId,
      toWarehouseId,
      quantity: quantityRaw,
      lot: optionalString(body, "lot"),
      batch: optionalString(body, "batch"),
      serialNumber: optionalString(body, "serialNumber"),
      reason: optionalString(body, "reason"),
    });
    return ok({ source: serializeStock(result.source), destination: serializeStock(result.destination) });
  } catch (e) {
    if (e instanceof ApiValidationError) return fail(e.message, 400);
    return authFail(e);
  }
}
