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
  listOrdersForOrganization
} from "../../src/lib/data/order-lookup";

const suffix =
  `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

const orgA = `ol-org-a-${suffix}`;
const orgB = `ol-org-b-${suffix}`;
const userA = `ol-user-a-${suffix}`;
const userB = `ol-user-b-${suffix}`;
const customerA = `ol-customer-a-${suffix}`;
const customerA2 = `ol-customer-a2-${suffix}`;
const customerB = `ol-customer-b-${suffix}`;

describe(
  "tenant-safe order lookup",
  () => {
    it(
      "returns only same-org orders, filters by id/customer/query/status, items ordered, empty valid",
      async () => {
        await db.organization.createMany({
          data: [
            { id: orgA, name: "OL A" },
            { id: orgB, name: "OL B" }
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
            status: "WON"
          }
        });

        const orderA = await db.order.create({
          data: {
            organizationId: orgA,
            customerId: customerA,
            sourceQuoteId: quoteA.id,
            orderNumber: "SIP-0001",
            customerName: "Zensoft Teknoloji",
            title: "Yıllık bakım teklifi"
          }
        });

        await db.orderItem.createMany({
          data: [
            {
              organizationId: orgA,
              orderId: orderA.id,
              name: "İkinci kalem",
              quantity: 1,
              unitPriceCents: BigInt(1000),
              lineTotalCents: BigInt(1000),
              sortOrder: 1
            },
            {
              organizationId: orgA,
              orderId: orderA.id,
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
            status: "WON"
          }
        });

        const orderA2 = await db.order.create({
          data: {
            organizationId: orgA,
            customerId: customerA2,
            sourceQuoteId: quoteA2.id,
            orderNumber: "SIP-0002",
            customerName: "Başka Müşteri",
            title: "Danışmanlık teklifi"
          }
        });

        const quoteB = await db.quote.create({
          data: {
            organizationId: orgB,
            customerId: customerB,
            customerName: "Zensoft Teknoloji",
            title: "Yıllık bakım teklifi",
            status: "WON"
          }
        });

        await db.order.create({
          data: {
            organizationId: orgB,
            customerId: customerB,
            sourceQuoteId: quoteB.id,
            orderNumber: "SIP-0001",
            customerName: "Zensoft Teknoloji",
            title: "Yıllık bakım teklifi"
          }
        });

        const allInOrgA = await listOrdersForOrganization({
          actorUserId: userA,
          organizationId: orgA
        });

        expect(allInOrgA).toHaveLength(2);

        expect(
          allInOrgA.some(o => o.customerId === customerB)
        ).toBe(false);

        const byId = await listOrdersForOrganization({
          actorUserId: userA,
          organizationId: orgA,
          orderId: orderA.id
        });

        expect(byId).toHaveLength(1);
        expect(byId[0]?.id).toBe(orderA.id);

        const byCustomer = await listOrdersForOrganization({
          actorUserId: userA,
          organizationId: orgA,
          customerId: customerA2
        });

        expect(byCustomer).toHaveLength(1);
        expect(byCustomer[0]?.id).toBe(orderA2.id);

        const byQuery = await listOrdersForOrganization({
          actorUserId: userA,
          organizationId: orgA,
          query: "SIP-0002"
        });

        expect(byQuery).toHaveLength(1);
        expect(byQuery[0]?.id).toBe(orderA2.id);

        const byStatus = await listOrdersForOrganization({
          actorUserId: userA,
          organizationId: orgA,
          status: "DRAFT"
        });

        expect(byStatus).toHaveLength(2);

        const found = allInOrgA.find(
          o => o.id === orderA.id
        );

        expect(
          found?.items.map(item => item.name)
        ).toEqual(["Birinci kalem", "İkinci kalem"]);

        expect(
          typeof found?.items[0]?.unitPriceCents
        ).toBe("string");

        expect(found?.sourceQuoteId).toBe(quoteA.id);

        // cross-tenant direct id: empty, no leak
        const crossTenantById = await listOrdersForOrganization(
          {
            actorUserId: userA,
            organizationId: orgA,
            orderId: `does-not-exist-${suffix}`
          }
        );

        expect(crossTenantById).toEqual([]);

        const empty = await listOrdersForOrganization({
          actorUserId: userA,
          organizationId: orgA,
          query: "hiç eşleşmeyecek bir metin"
        });

        expect(empty).toEqual([]);

        expect(
          JSON.stringify(allInOrgA)
        ).not.toMatch(/actorUserId|idempotencyKey/);
      }
    );

    it(
      "rejects an actor without organization membership",
      async () => {
        await expect(
          listOrdersForOrganization({
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
  await db.orderItem.deleteMany({
    where: {
      organizationId: { in: [orgA, orgB] }
    }
  });

  await db.order.deleteMany({
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
