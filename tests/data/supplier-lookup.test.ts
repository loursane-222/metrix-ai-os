import { describe, expect, it, afterAll } from "vitest";

import { db } from "../../src/lib/db";
import { lookupSuppliersForOrganization } from "../../src/lib/data/supplier-lookup";

describe("tenant-safe supplier lookup", () => {
  it("returns only matching suppliers from the authorized organization", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const organizationId = `sup-lookup-org-${suffix}`;
    const otherOrgId = `sup-lookup-other-${suffix}`;
    const userId = `sup-lookup-user-${suffix}`;

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
      await db.supplier.create({
        data: { organizationId, name: "Anadolu Mermer Ltd." }
      });
      await db.supplier.create({
        data: { organizationId: otherOrgId, name: "Yabancı Tedarikçi" }
      });

      const results = await lookupSuppliersForOrganization({
        actorUserId: userId,
        organizationId,
        query: "mermer"
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe("Anadolu Mermer Ltd.");

      const empty = await lookupSuppliersForOrganization({
        actorUserId: userId,
        organizationId,
        query: ""
      });
      expect(empty).toEqual([]);
    } finally {
      await db.supplier.deleteMany({
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
