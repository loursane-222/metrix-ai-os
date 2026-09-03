import { randomUUID } from "crypto";
import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, ApiValidationError } from "@/lib/api/validation";
import { countStock, listStock, getStockByIdForOrganization } from "@/lib/core/stock/stock.service";
import { serializeStock } from "@/lib/core/stock/stock.serializer";
import { executeCanonicalOperation, canonicalOperationResultToHttpResponse } from "@/lib/canonical-operation";

export async function GET() {
  try {
    const auth = await requireAuthContextFromCookies();
    const [stocks, totalCount] = await Promise.all([
      listStock({ organizationId: auth.organization.id }),
      countStock({ organizationId: auth.organization.id }),
    ]);
    return ok({ stocks: stocks.map((s) => serializeStock(s)), count: totalCount });
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
    const unitCostRaw = (body as Record<string, unknown>).unitCostCents;
    const expectedAtRaw = optionalString(body, "expectedAt");
    if (!productServiceId) return fail("productServiceId is required.", 400);
    if (!warehouseId) return fail("warehouseId is required.", 400);
    if (typeof quantityRaw !== "number" || quantityRaw <= 0) return fail("quantity must be a positive number.", 400);
    if (expectedAtRaw && Number.isNaN(new Date(expectedAtRaw).valueOf())) return fail("expectedAt must be a valid date.", 400);
    if (unitCostRaw !== undefined && (typeof unitCostRaw !== "number" || !Number.isSafeInteger(unitCostRaw) || unitCostRaw < 0)) return fail("unitCostCents must be a non-negative safe integer.", 400);

    const correlationId = request.headers.get("X-Correlation-Id")?.trim() || randomUUID();
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || randomUUID();
    const result = await executeCanonicalOperation(
      {
        operationId: idempotencyKey,
        correlationId,
        organizationId: auth.organization.id,
        actorId: auth.user.id,
        source: "system",
        type: "CREATE",
        domain: "stock",
        entity: { entityType: "stock" },
        capability: "inventory.receive",
        payload: {
          productServiceId,
          warehouseId,
          quantity: quantityRaw,
          location: optionalString(body, "location"),
          lot: optionalString(body, "lot"),
          batch: optionalString(body, "batch"),
          serialNumber: optionalString(body, "serialNumber"),
          reason: optionalString(body, "reason"),
          supplierId: optionalString(body, "supplierId"),
          expectedAt: expectedAtRaw,
          unitCostCents: typeof unitCostRaw === "number" && Number.isSafeInteger(unitCostRaw) && unitCostRaw >= 0 ? unitCostRaw : undefined,
          qualityFlag: optionalString(body, "qualityFlag"),
        },
        revealIntent: { explicit: false },
      },
      { authContext: auth },
    );
    if (result.status !== "EXECUTED") return canonicalOperationResultToHttpResponse(result, "stock.receive");
    const stockId = result.entity?.entityId;
    const stock = stockId ? await getStockByIdForOrganization(stockId, auth.organization.id) : null;
    if (!stock) return fail("Stock record not found after execution.", 500);
    return ok({ stock: serializeStock(stock) }, 201);
  } catch (e) {
    if (e instanceof ApiValidationError) return fail(e.message, 400);
    return authFail(e);
  }
}
