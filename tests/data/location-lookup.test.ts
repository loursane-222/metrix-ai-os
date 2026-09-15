import { describe, expect, it, afterAll } from "vitest";

import { db } from "../../src/lib/db";
import { lookupLocationsForOrganization } from "../../src/lib/data/location-lookup";

describe("tenant-safe location lookup", () => {
  it("returns only same-org locations, filters by id/query/kind, empty valid", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const organizationId = `loc-lookup-org-${suffix}`;
    const otherOrgId = `loc-lookup-other-${suffix}`;
    const userId = `loc-lookup-user-${suffix}`;

    await db.organization.createMany({
      data: [
        { id: organizationId, name: "Lookup Tenant" },
        { id: otherOrgId, name: "Other Tenant" }
      ]
    });
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "Lookup User" }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });

    try {
      const warehouse = await db.location.create({
        data: { organizationId, name: "Merkez Depo", kind: "WAREHOUSE" }
      });
      await db.location.create({
        data: { organizationId, name: "Kadıköy Şube", kind: "BRANCH" }
      });
      await db.location.create({
        data: { organizationId: otherOrgId, name: "Yabancı Depo", kind: "WAREHOUSE" }
      });

      const all = await lookupLocationsForOrganization({
        actorUserId: userId,
        organizationId
      });
      expect(all).toHaveLength(2);

      const byId = await lookupLocationsForOrganization({
        actorUserId: userId,
        organizationId,
        locationId: warehouse.id
      });
      expect(byId).toHaveLength(1);
      expect(byId[0]?.id).toBe(warehouse.id);

      const byQuery = await lookupLocationsForOrganization({
        actorUserId: userId,
        organizationId,
        query: "kadıköy"
      });
      expect(byQuery).toHaveLength(1);

      const byKind = await lookupLocationsForOrganization({
        actorUserId: userId,
        organizationId,
        kind: "WAREHOUSE"
      });
      expect(byKind).toHaveLength(1);
      expect(byKind[0]?.kind).toBe("WAREHOUSE");

      const empty = await lookupLocationsForOrganization({
        actorUserId: userId,
        organizationId,
        query: "hiç eşleşmeyecek"
      });
      expect(empty).toEqual([]);
    } finally {
      await db.location.deleteMany({
        where: { organizationId: { in: [organizationId, otherOrgId] } }
      });
      await db.organizationMember.deleteMany({ where: { organizationId } });
      await db.user.deleteMany({ where: { id: userId } });
      await db.organization.deleteMany({
        where: { id: { in: [organizationId, otherOrgId] } }
      });
    }
  });
});

afterAll(async () => {
  await db.$disconnect();
});
