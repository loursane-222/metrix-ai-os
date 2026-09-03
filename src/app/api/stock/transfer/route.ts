import { randomUUID } from "crypto";
import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, ApiValidationError } from "@/lib/api/validation";
import { getStockByIdForOrganization } from "@/lib/core/stock/stock.service";
import { serializeStock } from "@/lib/core/stock/stock.serializer";
import { executeCanonicalOperation, canonicalOperationResultToHttpResponse } from "@/lib/canonical-operation";

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

    const correlationId = request.headers.get("X-Correlation-Id")?.trim() || randomUUID();
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || randomUUID();
    const result = await executeCanonicalOperation(
      {
        operationId: idempotencyKey,
        correlationId,
        organizationId: auth.organization.id,
        actorId: auth.user.id,
        source: "system",
        type: "UPDATE",
        domain: "stock",
        entity: { entityType: "stock" },
        capability: "inventory.transfer",
        payload: {
          productServiceId, fromWarehouseId, toWarehouseId, quantity: quantityRaw,
          lot: optionalString(body, "lot"), batch: optionalString(body, "batch"),
          serialNumber: optionalString(body, "serialNumber"), reason: optionalString(body, "reason"),
        },
        revealIntent: { explicit: false },
      },
      { authContext: auth },
    );
    if (result.status !== "EXECUTED") return canonicalOperationResultToHttpResponse(result, "stock.transfer");
    const metadata = result.data as { sourceStockId?: string; destinationStockId?: string } | undefined;
    const [source, destination] = await Promise.all([
      metadata?.sourceStockId ? getStockByIdForOrganization(metadata.sourceStockId, auth.organization.id) : Promise.resolve(null),
      metadata?.destinationStockId ? getStockByIdForOrganization(metadata.destinationStockId, auth.organization.id) : Promise.resolve(null),
    ]);
    if (!destination) return fail("Destination stock record not found after execution.", 500);
    return ok({ source: source ? serializeStock(source) : null, destination: serializeStock(destination) });
  } catch (e) {
    if (e instanceof ApiValidationError) return fail(e.message, 400);
    return authFail(e);
  }
}
