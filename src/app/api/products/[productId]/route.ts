import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  optionalJsonValue,
  optionalNumber,
  optionalString,
  optionalStringEnum,
  readJsonObject,
} from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import {
  getProductServiceByIdForOrganization,
  updateProductServiceDetails,
} from "@/lib/core/products/product.service";
import type { ProductServiceResult } from "@/lib/core/products/product.types";

function serializeProduct(product: ProductServiceResult) {
  return {
    ...product,
    costCents: product.costCents?.toString() ?? null,
    priceCents: product.priceCents?.toString() ?? null,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ productId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { productId } = await context.params;

    const product = await getProductServiceByIdForOrganization(productId, authContext.organization.id);

    if (!product) {
      return fail("Product not found.", 404);
    }

    return ok({ product: serializeProduct(product) });
  } catch (error: unknown) {
    return authFail(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ productId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { productId } = await context.params;
    const body = await readJsonObject(request);

    const rawCostCents = optionalNumber(body, "costCents");
    const rawPriceCents = optionalNumber(body, "priceCents");

    await updateProductServiceDetails({
      id: productId,
      organizationId: authContext.organization.id,
      name: optionalString(body, "name"),
      type: optionalStringEnum(body, "type", ["PRODUCT", "SERVICE"]),
      category: optionalString(body, "category"),
      unit: optionalString(body, "unit"),
      costCents: rawCostCents !== undefined ? BigInt(Math.round(rawCostCents)) : undefined,
      priceCents: rawPriceCents !== undefined ? BigInt(Math.round(rawPriceCents)) : undefined,
      currency: optionalString(body, "currency"),
      stockBehavior: optionalString(body, "stockBehavior"),
      attributesJson: optionalJsonValue(body, "attributesJson"),
      status: optionalStringEnum(body, "status", ["ACTIVE", "PASSIVE", "ARCHIVED"]),
    });

    const updated = await getProductServiceByIdForOrganization(productId, authContext.organization.id);

    if (!updated) {
      return fail("Product not found.", 404);
    }

    return ok({ product: serializeProduct(updated) });
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}
