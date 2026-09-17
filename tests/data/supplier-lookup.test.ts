import { describe, expect, it, afterAll } from "vitest";

import { db } from "../../src/lib/db";
import { lookupSuppliersForOrganization } from "../../src/lib/data/supplier-lookup";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationId = `sup-lookup-org-${suffix}`;
const otherOrgId = `sup-lookup-other-${suffix}`;
const userId = `sup-lookup-user-${suffix}`;

describe("tenant-safe supplier lookup", () => {
  it("returns only matching suppliers from the authorized organization", async () => {
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

    const noMatch = await lookupSuppliersForOrganization({
      actorUserId: userId,
      organizationId,
      query: "hiç eşleşmeyecek bir isim"
    });
    expect(noMatch).toEqual([]);
  });

  it(
    "returns a bounded, tenant-scoped organization-wide collection when no query is given (including a blank one)",
    async () => {
      const noQuery = await lookupSuppliersForOrganization({
        actorUserId: userId,
        organizationId
      });

      expect(noQuery).toHaveLength(1);
      expect(noQuery[0]?.name).toBe("Anadolu Mermer Ltd.");
      expect(
        noQuery.every((supplier) => supplier.organizationId === organizationId)
      ).toBe(true);

      const blankQuery = await lookupSuppliersForOrganization({
        actorUserId: userId,
        organizationId,
        query: ""
      });

      expect(blankQuery).toEqual(noQuery);
    }
  );

  it(
    "returns a valid empty collection for an organization with no suppliers",
    async () => {
      const emptyOrgId = `sup-empty-org-${suffix}`;
      const emptyUserId = `sup-empty-user-${suffix}`;

      await db.organization.create({
        data: { id: emptyOrgId, name: "Empty Supplier Org" }
      });
      await db.user.create({
        data: {
          id: emptyUserId,
          email: `${emptyUserId}@example.test`,
          name: "Empty User"
        }
      });
      await db.organizationMember.create({
        data: { organizationId: emptyOrgId, userId: emptyUserId, role: "MEMBER" }
      });

      const result = await lookupSuppliersForOrganization({
        actorUserId: emptyUserId,
        organizationId: emptyOrgId
      });

      expect(result).toEqual([]);

      await db.organizationMember.deleteMany({
        where: { organizationId: emptyOrgId }
      });
      await db.user.deleteMany({ where: { id: emptyUserId } });
      await db.organization.deleteMany({ where: { id: emptyOrgId } });
    }
  );

  it(
    "returns a deterministic bounded (20-record) result when the organization has more than 20 suppliers",
    async () => {
      const manyOrgId = `sup-many-org-${suffix}`;
      const manyUserId = `sup-many-user-${suffix}`;

      await db.organization.create({
        data: { id: manyOrgId, name: "Many Suppliers Org" }
      });
      await db.user.create({
        data: {
          id: manyUserId,
          email: `${manyUserId}@example.test`,
          name: "Many User"
        }
      });
      await db.organizationMember.create({
        data: { organizationId: manyOrgId, userId: manyUserId, role: "MEMBER" }
      });

      await db.supplier.createMany({
        data: Array.from({ length: 25 }, (_, index) => ({
          organizationId: manyOrgId,
          name: `Tedarikci ${String(index).padStart(2, "0")}`
        }))
      });

      const first = await lookupSuppliersForOrganization({
        actorUserId: manyUserId,
        organizationId: manyOrgId
      });
      const second = await lookupSuppliersForOrganization({
        actorUserId: manyUserId,
        organizationId: manyOrgId
      });

      expect(first).toHaveLength(20);
      expect(first.map((s) => s.id)).toEqual(second.map((s) => s.id));
      expect(first[0]?.name).toBe("Tedarikci 00");

      await db.supplier.deleteMany({ where: { organizationId: manyOrgId } });
      await db.organizationMember.deleteMany({
        where: { organizationId: manyOrgId }
      });
      await db.user.deleteMany({ where: { id: manyUserId } });
      await db.organization.deleteMany({ where: { id: manyOrgId } });
    }
  );
});

afterAll(async () => {
  await db.supplier.deleteMany({
    where: { organizationId: { in: [organizationId, otherOrgId] } }
  });
  await db.organizationMember.deleteMany({ where: { organizationId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.organization.deleteMany({
    where: { id: { in: [organizationId, otherOrgId] } }
  });
  await db.$disconnect();
});
