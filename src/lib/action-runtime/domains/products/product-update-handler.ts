import { getProductServiceByIdForOrganization, updateProductServiceDetails } from "@/lib/core/products/product.service";
import type { ActionExecutionEnvelope, ActionHandler, HandlerResult } from "../../execution";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

/**
 * product.update için Domain Action handler'ı. Mevcut
 * updateProductServiceDetails service'ini sarar — PATCH /api/products/
 * [productId] ile aynı alanların bir alt kümesi (name/category/unit/
 * costCents/priceCents/currency/stockBehavior); type/attributesJson/status
 * bilinçli olarak bu ilk kapsamın dışında bırakılmıştır (bkz. final rapor).
 */
export const productUpdateHandler: ActionHandler = async (
  envelope: ActionExecutionEnvelope,
): Promise<HandlerResult> => {
  const { productServiceId, name, category, unit, costCents, priceCents, currency, stockBehavior } = envelope.input;
  const organizationId = envelope.executionContext.organizationId;
  const resolvedId = requiredString(productServiceId, "productServiceId");

  if ([name, category, unit, costCents, priceCents, currency, stockBehavior].every((value) => value === undefined)) {
    throw new Error("At least one updatable field is required.");
  }

  const before = await getProductServiceByIdForOrganization(resolvedId, organizationId);
  if (!before) throw new Error("Product not found.");

  await updateProductServiceDetails({
    id: resolvedId,
    organizationId,
    name: typeof name === "string" ? name : undefined,
    category: typeof category === "string" ? category : undefined,
    unit: typeof unit === "string" ? unit : undefined,
    costCents: typeof costCents === "number" ? BigInt(Math.round(costCents)) : undefined,
    priceCents: typeof priceCents === "number" ? BigInt(Math.round(priceCents)) : undefined,
    currency: typeof currency === "string" ? currency : undefined,
    stockBehavior: typeof stockBehavior === "string" ? stockBehavior : undefined,
  });

  const updated = await getProductServiceByIdForOrganization(resolvedId, organizationId);
  if (!updated) throw new Error("Product not found.");

  const changedFields = [
    ...(typeof name === "string" ? ["name"] : []),
    ...(typeof category === "string" ? ["category"] : []),
    ...(typeof unit === "string" ? ["unit"] : []),
    ...(typeof costCents === "number" ? ["costCents"] : []),
    ...(typeof priceCents === "number" ? ["priceCents"] : []),
    ...(typeof currency === "string" ? ["currency"] : []),
    ...(typeof stockBehavior === "string" ? ["stockBehavior"] : []),
  ];

  return {
    status: "SUCCESS",
    entityRef: { entityType: "product", entityId: resolvedId },
    resultSummary: `product.update applied to ${changedFields.length} field(s).`,
    metadata: { changedFields },
    domainEvents: [],
    sideEffects: [],
    compensationSnapshot: {
      productServiceId: resolvedId,
      ...(typeof name === "string" ? { name: before.name } : {}),
      ...(typeof category === "string" ? { category: before.category } : {}),
      ...(typeof unit === "string" ? { unit: before.unit } : {}),
      ...(typeof costCents === "number" ? { costCents: before.costCents !== null ? Number(before.costCents) : undefined } : {}),
      ...(typeof priceCents === "number" ? { priceCents: before.priceCents !== null ? Number(before.priceCents) : undefined } : {}),
      ...(typeof currency === "string" ? { currency: before.currency } : {}),
      ...(typeof stockBehavior === "string" ? { stockBehavior: before.stockBehavior } : {}),
    },
  };
};
