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
  lookupCustomersForOrganization
} from "../../src/lib/data/customer-lookup";

const suffix =
  `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

const orgA =
  `lookup-org-a-${suffix}`;

const orgB =
  `lookup-org-b-${suffix}`;

const userA =
  `lookup-user-a-${suffix}`;

const userB =
  `lookup-user-b-${suffix}`;

describe(
  "tenant-safe customer lookup",
  () => {
    it(
      "returns only matching customers from the authorized organization",
      async () => {
        await db.organization.createMany({
          data: [
            {
              id: orgA,
              name: "Lookup A"
            },
            {
              id: orgB,
              name: "Lookup B"
            }
          ]
        });

        await db.user.createMany({
          data: [
            {
              id: userA,
              email:
                `${userA}@example.test`,
              name: "User A"
            },
            {
              id: userB,
              email:
                `${userB}@example.test`,
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

        await db.customer.createMany({
          data: [
            {
              organizationId: orgA,
              name: "Belgin Tekstil",
              email: "belgin-a@example.test",
              externalId: `a-belgin-${suffix}`
            },
            {
              organizationId: orgA,
              name: "Başka Müşteri",
              email: "other@example.test",
              externalId: `a-other-${suffix}`
            },
            {
              organizationId: orgB,
              name: "Belgin Tekstil",
              email: "belgin-b@example.test",
              externalId: `b-belgin-${suffix}`
            }
          ]
        });

        const result =
          await lookupCustomersForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            query: "Belgin"
          });

        expect(result).toHaveLength(1);

        expect(result[0]).toMatchObject({
          organizationId: orgA,
          name: "Belgin Tekstil",
          email: "belgin-a@example.test"
        });

        expect(
          result.some(
            customer =>
              customer.organizationId === orgB
          )
        ).toBe(false);
      }
    );

    it(
      "rejects an actor without organization membership",
      async () => {
        await expect(
          lookupCustomersForOrganization({
            actorUserId: userB,
            organizationId: orgA,
            query: "Belgin"
          })
        ).rejects.toBeInstanceOf(
          OrganizationAccessDeniedError
        );
      }
    );

    it(
      "returns a bounded, tenant-scoped organization-wide collection when no query is given",
      async () => {
        const noFilter = await lookupCustomersForOrganization({
          actorUserId: userA,
          organizationId: orgA
        });

        expect(noFilter).toHaveLength(2);

        expect(
          noFilter.every((customer) => customer.organizationId === orgA)
        ).toBe(true);

        expect(
          noFilter.some((customer) => customer.organizationId === orgB)
        ).toBe(false);
      }
    );

    it(
      "returns a valid empty collection for an organization with no customers",
      async () => {
        const emptyOrgId = `lookup-empty-org-${suffix}`;
        const emptyOrgUserId = `lookup-empty-user-${suffix}`;

        await db.organization.create({
          data: { id: emptyOrgId, name: "Empty Org" }
        });

        await db.user.create({
          data: {
            id: emptyOrgUserId,
            email: `${emptyOrgUserId}@example.test`,
            name: "Empty Org User"
          }
        });

        await db.organizationMember.create({
          data: {
            organizationId: emptyOrgId,
            userId: emptyOrgUserId,
            role: "MEMBER"
          }
        });

        const result = await lookupCustomersForOrganization({
          actorUserId: emptyOrgUserId,
          organizationId: emptyOrgId
        });

        expect(result).toEqual([]);

        await db.organizationMember.deleteMany({
          where: { organizationId: emptyOrgId }
        });
        await db.user.deleteMany({ where: { id: emptyOrgUserId } });
        await db.organization.deleteMany({ where: { id: emptyOrgId } });
      }
    );

    it(
      "returns a deterministic bounded (20-record) result when the organization has more than 20 customers",
      async () => {
        const manyOrgId = `lookup-many-org-${suffix}`;
        const manyUserId = `lookup-many-user-${suffix}`;

        await db.organization.create({
          data: { id: manyOrgId, name: "Many Customers Org" }
        });

        await db.user.create({
          data: {
            id: manyUserId,
            email: `${manyUserId}@example.test`,
            name: "Many User"
          }
        });

        await db.organizationMember.create({
          data: {
            organizationId: manyOrgId,
            userId: manyUserId,
            role: "MEMBER"
          }
        });

        await db.customer.createMany({
          data: Array.from({ length: 25 }, (_, index) => ({
            organizationId: manyOrgId,
            name: `Musteri ${String(index).padStart(2, "0")}`,
            externalId: `many-${suffix}-${index}`
          }))
        });

        const first = await lookupCustomersForOrganization({
          actorUserId: manyUserId,
          organizationId: manyOrgId
        });

        const second = await lookupCustomersForOrganization({
          actorUserId: manyUserId,
          organizationId: manyOrgId
        });

        expect(first).toHaveLength(20);
        expect(first.map((c) => c.id)).toEqual(second.map((c) => c.id));
        expect(first[0]?.name).toBe("Musteri 00");

        await db.customer.deleteMany({ where: { organizationId: manyOrgId } });
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
  await db.customer.deleteMany({
    where: {
      organizationId: {
        in: [orgA, orgB]
      }
    }
  });

  await db.organizationMember.deleteMany({
    where: {
      organizationId: {
        in: [orgA, orgB]
      }
    }
  });

  await db.organization.deleteMany({
    where: {
      id: {
        in: [orgA, orgB]
      }
    }
  });

  await db.user.deleteMany({
    where: {
      id: {
        in: [userA, userB]
      }
    }
  });

  await db.$disconnect();
});
