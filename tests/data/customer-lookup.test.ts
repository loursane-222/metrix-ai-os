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
