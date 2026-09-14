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
  getQuoteWithItemsForOrganization,
  listQuotesForOrganization
} from "../../src/lib/data/quote-lookup";

const suffix =
  `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

const orgA = `ql-org-a-${suffix}`;
const orgB = `ql-org-b-${suffix}`;
const userA = `ql-user-a-${suffix}`;
const userB = `ql-user-b-${suffix}`;
const customerA = `ql-customer-a-${suffix}`;
const customerA2 = `ql-customer-a2-${suffix}`;
const customerB = `ql-customer-b-${suffix}`;

describe(
  "tenant-safe quote lookup",
  () => {
    it(
      "returns only same-org quotes, filters by query/customer/status, items ordered by sortOrder, empty valid",
      async () => {
        await db.organization.createMany({
          data: [
            { id: orgA, name: "QL A" },
            { id: orgB, name: "QL B" }
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

        await db.customer.createMany({
          data: [
            {
              id: customerA,
              organizationId: orgA,
              name: "Zensoft Teknoloji"
            },
            {
              id: customerA2,
              organizationId: orgA,
              name: "Başka Müşteri"
            },
            {
              id: customerB,
              organizationId: orgB,
              name: "Zensoft Teknoloji"
            }
          ]
        });

        const quoteA = await db.quote.create({
          data: {
            organizationId: orgA,
            customerId: customerA,
            customerName: "Zensoft Teknoloji",
            title: "Yıllık bakım teklifi",
            currency: "TRY"
          }
        });

        await db.quoteItem.createMany({
          data: [
            {
              organizationId: orgA,
              quoteId: quoteA.id,
              name: "İkinci kalem",
              quantity: 1,
              unitPriceCents: BigInt(1000),
              lineTotalCents: BigInt(1000),
              sortOrder: 1
            },
            {
              organizationId: orgA,
              quoteId: quoteA.id,
              name: "Birinci kalem",
              quantity: 1,
              unitPriceCents: BigInt(500),
              lineTotalCents: BigInt(500),
              sortOrder: 0
            }
          ]
        });

        const quoteA2 = await db.quote.create({
          data: {
            organizationId: orgA,
            customerId: customerA2,
            customerName: "Başka Müşteri",
            title: "Danışmanlık teklifi",
            currency: "TRY"
          }
        });

        await db.quote.create({
          data: {
            organizationId: orgB,
            customerId: customerB,
            customerName: "Zensoft Teknoloji",
            title: "Yıllık bakım teklifi",
            currency: "TRY"
          }
        });

        const allInOrgA =
          await listQuotesForOrganization({
            actorUserId: userA,
            organizationId: orgA
          });

        expect(allInOrgA).toHaveLength(2);

        expect(
          allInOrgA.some(
            q => q.customerId === customerB
          )
        ).toBe(false);

        const byQuery =
          await listQuotesForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            query: "bakım"
          });

        expect(byQuery).toHaveLength(1);
        expect(byQuery[0]?.id).toBe(quoteA.id);

        const byCustomer =
          await listQuotesForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            customerId: customerA2
          });

        expect(byCustomer).toHaveLength(1);
        expect(byCustomer[0]?.id).toBe(
          quoteA2.id
        );

        const byStatus =
          await listQuotesForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            status: "DRAFT"
          });

        expect(byStatus).toHaveLength(2);

        const found = allInOrgA.find(
          q => q.id === quoteA.id
        );

        expect(
          found?.items.map(item => item.name)
        ).toEqual([
          "Birinci kalem",
          "İkinci kalem"
        ]);

        expect(
          typeof found?.items[0]
            ?.unitPriceCents
        ).toBe("string");

        const empty =
          await listQuotesForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            query: "hiç eşleşmeyecek metin"
          });

        expect(empty).toEqual([]);

        const single =
          await getQuoteWithItemsForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            quoteId: quoteA.id
          });

        expect(single?.id).toBe(quoteA.id);
        expect(single?.items).toHaveLength(2);

        const crossOrgFetch =
          await getQuoteWithItemsForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            quoteId: "does-not-exist"
          });

        expect(crossOrgFetch).toBeNull();

        expect(
          JSON.stringify(allInOrgA)
        ).not.toMatch(/actorUserId|idempotencyKey/);
      }
    );

    it(
      "rejects an actor without organization membership",
      async () => {
        await expect(
          listQuotesForOrganization({
            actorUserId: userB,
            organizationId: orgA
          })
        ).rejects.toBeInstanceOf(
          OrganizationAccessDeniedError
        );
      }
    );
  }
);

afterAll(async () => {
  await db.quoteItem.deleteMany({
    where: {
      organizationId: { in: [orgA, orgB] }
    }
  });

  await db.quote.deleteMany({
    where: {
      organizationId: { in: [orgA, orgB] }
    }
  });

  await db.customer.deleteMany({
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
