import { db } from "../db";

import { requireOrganizationAccess } from "../auth/organization-access";

export type SupplierReality = {
  id: string;
  organizationId: string;
  name: string;
  externalId: string | null;
};

/**
 * query verilirse isimle daraltılmış arama, verilmezse organizasyonun
 * tedarikçi kayıtlarının sınırlı (bounded) koleksiyonu.
 */
export async function lookupSuppliersForOrganization(
  input: {
    actorUserId: string;
    organizationId: string;
    query?: string;
  }
): Promise<SupplierReality[]> {
  const actorUserId = input.actorUserId.trim();
  const organizationId = input.organizationId.trim();
  const query = input.query?.trim();

  await requireOrganizationAccess({ userId: actorUserId, organizationId });

  return db.supplier.findMany({
    where: {
      organizationId,
      ...(query
        ? { name: { contains: query, mode: "insensitive" as const } }
        : {})
    },
    select: { id: true, organizationId: true, name: true, externalId: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 20
  });
}
