import { db } from "../db";

import { requireOrganizationAccess } from "../auth/organization-access";

export type SupplierReality = {
  id: string;
  organizationId: string;
  name: string;
  externalId: string | null;
};

export async function lookupSuppliersForOrganization(
  input: {
    actorUserId: string;
    organizationId: string;
    query: string;
  }
): Promise<SupplierReality[]> {
  const actorUserId = input.actorUserId.trim();
  const organizationId = input.organizationId.trim();
  const query = input.query.trim();

  await requireOrganizationAccess({ userId: actorUserId, organizationId });

  if (!query) {
    return [];
  }

  return db.supplier.findMany({
    where: {
      organizationId,
      name: { contains: query, mode: "insensitive" }
    },
    select: { id: true, organizationId: true, name: true, externalId: true },
    orderBy: { name: "asc" },
    take: 20
  });
}
