import {
  db
} from "../db";

import {
  requireOrganizationAccess
} from "../auth/organization-access";

export type CustomerReality = {
  id: string;
  organizationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  externalId: string | null;
};

/**
 * query verilirse isimle daraltılmış arama, verilmezse organizasyonun
 * sınırlı (bounded) müşteri koleksiyonu — quote/order/invoice/location
 * lookup'larının zaten kullandığı "no selector -> bounded collection"
 * standardıyla aynı desen.
 */
export async function lookupCustomersForOrganization(
  input: {
    actorUserId: string;
    organizationId: string;
    query?: string;
  }
): Promise<CustomerReality[]> {
  const actorUserId =
    input.actorUserId.trim();

  const organizationId =
    input.organizationId.trim();

  const query =
    input.query?.trim();

  await requireOrganizationAccess({
    userId: actorUserId,
    organizationId
  });

  return db.customer.findMany({
    where: {
      organizationId,
      ...(query
        ? {
            name: {
              contains: query,
              mode: "insensitive" as const
            }
          }
        : {})
    },
    select: {
      id: true,
      organizationId: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      taxNumber: true,
      taxOffice: true,
      contactName: true,
      contactPhone: true,
      notes: true,
      externalId: true
    },
    orderBy: [
      { name: "asc" },
      { id: "asc" }
    ],
    take: 20
  });
}
