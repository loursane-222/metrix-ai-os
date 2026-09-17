import {
  afterAll,
  describe,
  expect,
  it
} from "vitest";

import {
  db
} from "../../src/lib/db";

import {
  OrganizationAccessDeniedError
} from "../../src/lib/auth/organization-access";

import {
  lookupProductServicesForOrganization
} from "../../src/lib/data/product-service-lookup";

const suffix =
  `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

const orgA = `psl-org-a-${suffix}`;
const orgB = `psl-org-b-${suffix}`;
const userA = `psl-user-a-${suffix}`;
const userB = `psl-user-b-${suffix}`;

describe(
  "tenant-safe product/service lookup",
  () => {
    it(
      "returns only same-org ACTIVE records, excludes archived, deterministic and bounded",
      async () => {
        await db.organization.createMany({
          data: [
            { id: orgA, name: "PSL A" },
            { id: orgB, name: "PSL B" }
          ]
        });

        await db.user.createMany({
          data: [
            {
              id: userA,
              email: `${userA}@example.test`,
              name: "User A"
            },
            {
              id: userB,
              email: `${userB}@example.test`,
              name: "User B"
            }
          ]
        });

        await db.organizationMember.createMany({
          data: [
            {
              organizationId: orgA,
              userId: userA,
              role: "MEMBER"
            },
            {
              organizationId: orgB,
              userId: userB,
              role: "MEMBER"
            }
          ]
        });

        await db.productService.create({
          data: {
            organizationId: orgA,
            name: "Danışmanlık Hizmeti",
            type: "SERVICE",
            unit: "saat",
            priceCents: BigInt(50_000),
            status: "ACTIVE"
          }
        });

        await db.productService.create({
          data: {
            organizationId: orgA,
            name: "Danışmanlık Arşiv",
            type: "SERVICE",
            priceCents: BigInt(1000),
            status: "ARCHIVED"
          }
        });

        await db.productService.create({
          data: {
            organizationId: orgA,
            name: "Danışman Masası",
            type: "PRODUCT",
            priceCents: BigInt(200_000),
            status: "ACTIVE"
          }
        });

        await db.productService.create({
          data: {
            organizationId: orgB,
            name: "Danışmanlık Hizmeti",
            type: "SERVICE",
            priceCents: BigInt(99_999),
            status: "ACTIVE"
          }
        });

        const result =
          await lookupProductServicesForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            query: "Danış"
          });

        expect(result).toHaveLength(2);

        expect(
          result.every(p => p.status === "ACTIVE")
        ).toBe(true);

        expect(
          result.some(
            p => p.name === "Danışmanlık Arşiv"
          )
        ).toBe(false);

        expect(
          result.some(
            p => p.priceCents === "99999"
          )
        ).toBe(false);

        expect(
          result.map(p => p.name)
        ).toEqual([
          "Danışman Masası",
          "Danışmanlık Hizmeti"
        ]);

        expect(
          typeof result[0]?.priceCents
        ).toBe("string");

        const typeFiltered =
          await lookupProductServicesForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            query: "Danış",
            type: "SERVICE"
          });

        expect(typeFiltered).toHaveLength(1);
        expect(typeFiltered[0]?.name).toBe(
          "Danışmanlık Hizmeti"
        );

        const noResult =
          await lookupProductServicesForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            query: "hiç eşleşmeyecek"
          });

        expect(noResult).toEqual([]);

        expect(
          JSON.stringify(result)
        ).not.toMatch(
          /actorUserId|organizationId|costCents/
        );
      }
    );

    it(
      "rejects an actor without organization membership",
      async () => {
        await expect(
          lookupProductServicesForOrganization({
            actorUserId: userB,
            organizationId: orgA,
            query: "Danış"
          })
        ).rejects.toBeInstanceOf(
          OrganizationAccessDeniedError
        );
      }
    );

    it(
      "returns a bounded, tenant-scoped, ACTIVE-only organization collection when no query is given",
      async () => {
        const noFilter = await lookupProductServicesForOrganization({
          actorUserId: userA,
          organizationId: orgA
        });

        expect(noFilter).toHaveLength(2);
        expect(noFilter.every((p) => p.status === "ACTIVE")).toBe(true);
        expect(
          noFilter.some((p) => p.name === "Danışmanlık Arşiv")
        ).toBe(false);
      }
    );

    it(
      "returns a valid empty collection for an organization with no products/services",
      async () => {
        const emptyOrgId = `psl-empty-org-${suffix}`;
        const emptyUserId = `psl-empty-user-${suffix}`;

        await db.organization.create({
          data: { id: emptyOrgId, name: "PSL Empty Org" }
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

        const result = await lookupProductServicesForOrganization({
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
      "returns a deterministic bounded (20-record) result when the organization has more than 20 ACTIVE records",
      async () => {
        const manyOrgId = `psl-many-org-${suffix}`;
        const manyUserId = `psl-many-user-${suffix}`;

        await db.organization.create({
          data: { id: manyOrgId, name: "PSL Many Org" }
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

        await db.productService.createMany({
          data: Array.from({ length: 25 }, (_, index) => ({
            organizationId: manyOrgId,
            name: `Urun ${String(index).padStart(2, "0")}`,
            type: "PRODUCT" as const,
            status: "ACTIVE" as const
          }))
        });

        const first = await lookupProductServicesForOrganization({
          actorUserId: manyUserId,
          organizationId: manyOrgId
        });

        const second = await lookupProductServicesForOrganization({
          actorUserId: manyUserId,
          organizationId: manyOrgId
        });

        expect(first).toHaveLength(20);
        expect(first.map((p) => p.id)).toEqual(second.map((p) => p.id));
        expect(first[0]?.name).toBe("Urun 00");

        await db.productService.deleteMany({
          where: { organizationId: manyOrgId }
        });
        await db.organizationMember.deleteMany({
          where: { organizationId: manyOrgId }
        });
        await db.user.deleteMany({ where: { id: manyUserId } });
        await db.organization.deleteMany({ where: { id: manyOrgId } });
      }
    );
  }
);

afterAll(async () => {
  await db.productService.deleteMany({
    where: {
      organizationId: { in: [orgA, orgB] }
    }
  });

  await db.organizationMember.deleteMany({
    where: {
      organizationId: { in: [orgA, orgB] }
    }
  });

  await db.organization.deleteMany({
    where: { id: { in: [orgA, orgB] } }
  });

  await db.user.deleteMany({
    where: { id: { in: [userA, userB] } }
  });

  await db.$disconnect();
});
