import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  optionalJsonValue,
  optionalNumber,
  optionalString,
  readJsonObject,
  requiredString,
  requiredStringEnum,
} from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { createNewProductService, listProductServices } from "@/lib/core/products/product.service";
import type { ProductServiceResult } from "@/lib/core/products/product.types";
import type { ProductServiceStatus, ProductServiceType } from "@prisma/client";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";

const PRODUCT_TYPES = ["PRODUCT", "SERVICE"] as const satisfies readonly ProductServiceType[];
const PRODUCT_STATUSES = ["ACTIVE", "PASSIVE", "ARCHIVED"] as const satisfies readonly ProductServiceStatus[];

function serializeProduct(product: ProductServiceResult) {
  return {
    ...product,
    costCents: product.costCents?.toString() ?? null,
    priceCents: product.priceCents?.toString() ?? null,
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { searchParams } = new URL(request.url);
    const rawType = searchParams.get("type") ?? undefined;
    const rawStatus = searchParams.get("status") ?? undefined;

    if (rawType !== undefined && !(PRODUCT_TYPES as readonly string[]).includes(rawType)) {
      return fail("type is invalid.", 400);
    }

    if (rawStatus !== undefined && !(PRODUCT_STATUSES as readonly string[]).includes(rawStatus)) {
      return fail("status is invalid.", 400);
    }

    const products = await listProductServices({
      organizationId: authContext.organization.id,
      type: rawType as ProductServiceType | undefined,
      status: rawStatus as ProductServiceStatus | undefined,
    });

    return ok({ products: products.map(serializeProduct), count: products.length });
  } catch (error: unknown) {
    return authFail(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const security = authorizeLegacyMutation({ authContext, actionName: "product.create", requiredPermission: "products.write", entityType: "ProductService" });
    const body = await readJsonObject(request);

    const rawCostCents = optionalNumber(body, "costCents");
    const rawPriceCents = optionalNumber(body, "priceCents");

    const product = await createNewProductService({
      organizationId: authContext.organization.id,
      name: requiredString(body, "name"),
      type: requiredStringEnum(body, "type", PRODUCT_TYPES),
      category: optionalString(body, "category"),
      unit: optionalString(body, "unit"),
      costCents: rawCostCents !== undefined ? BigInt(Math.round(rawCostCents)) : undefined,
      priceCents: rawPriceCents !== undefined ? BigInt(Math.round(rawPriceCents)) : undefined,
      currency: optionalString(body, "currency"),
      stockBehavior: optionalString(body, "stockBehavior"),
      attributesJson: optionalJsonValue(body, "attributesJson"),
    });
    security.succeed(product.id);

    return ok({ product: serializeProduct(product) }, 201);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}
