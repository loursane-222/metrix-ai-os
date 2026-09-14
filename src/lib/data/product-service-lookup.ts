import {
  db
} from "../db";

import {
  requireOrganizationAccess
} from "../auth/organization-access";

export type ProductServiceReality = {
  id: string;
  name: string;
  type: "PRODUCT" | "SERVICE";
  category: string | null;
  unit: string | null;
  priceCents: string | null;
  currency: string;
  status: "ACTIVE" | "ARCHIVED";
};

const MAX_RESULTS = 20;

export async function lookupProductServicesForOrganization(
  input: {
    actorUserId: string;
    organizationId: string;
    query: string;
    type?: "PRODUCT" | "SERVICE";
  }
): Promise<ProductServiceReality[]> {
  const actorUserId =
    input.actorUserId.trim();

  const organizationId =
    input.organizationId.trim();

  const query =
    input.query.trim();

  await requireOrganizationAccess({
    userId: actorUserId,
    organizationId
  });

  if (!query) {
    return [];
  }

  const products =
    await db.productService.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        name: {
          contains: query,
          mode: "insensitive"
        },
        ...(input.type
          ? { type: input.type }
          : {})
      },
      select: {
        id: true,
        name: true,
        type: true,
        category: true,
        unit: true,
        priceCents: true,
        currency: true,
        status: true
      },
      orderBy: [
        { name: "asc" },
        { id: "asc" }
      ],
      take: MAX_RESULTS
    });

  return products.map(product => ({
    id: product.id,
    name: product.name,
    type: product.type,
    category: product.category,
    unit: product.unit,
    priceCents:
      product.priceCents === null
        ? null
        : product.priceCents.toString(),
    currency: product.currency,
    status: product.status
  }));
}
