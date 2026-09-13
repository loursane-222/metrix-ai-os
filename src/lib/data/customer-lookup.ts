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
  externalId: string | null;
};

export async function lookupCustomersForOrganization(
  input: {
    actorUserId: string;
    organizationId: string;
    query: string;
  }
): Promise<CustomerReality[]> {
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

  return db.customer.findMany({
    where: {
      organizationId,
      name: {
        contains: query,
        mode: "insensitive"
      }
    },
    select: {
      id: true,
      organizationId: true,
      name: true,
      email: true,
      externalId: true
    },
    orderBy: {
      name: "asc"
    },
    take: 20
  });
}
