import { db } from "../db";

import { requireOrganizationAccess } from "../auth/organization-access";

import type { LocationKind } from "../../generated/prisma/enums";

export type LocationReality = {
  id: string;
  organizationId: string;
  name: string;
  kind: LocationKind;
  externalId: string | null;
};

export async function lookupLocationsForOrganization(
  input: {
    actorUserId: string;
    organizationId: string;
    locationId?: string;
    query?: string;
    kind?: LocationKind;
  }
): Promise<LocationReality[]> {
  const actorUserId = input.actorUserId.trim();
  const organizationId = input.organizationId.trim();
  const locationId = input.locationId?.trim();
  const query = input.query?.trim();

  await requireOrganizationAccess({ userId: actorUserId, organizationId });

  return db.location.findMany({
    where: {
      organizationId,
      ...(locationId ? { id: locationId } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(query
        ? { name: { contains: query, mode: "insensitive" as const } }
        : {})
    },
    select: {
      id: true,
      organizationId: true,
      name: true,
      kind: true,
      externalId: true
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 20
  });
}
