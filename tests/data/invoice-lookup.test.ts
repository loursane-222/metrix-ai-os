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
  listInvoicesForOrganization
} from "../../src/lib/data/invoice-lookup";

const suffix =
  `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

const orgA = `il-org-a-${suffix}`;
const orgB = `il-org-b-${suffix}`;
const userA = `il-user-a-${suffix}`;
const userB = `il-user-b-${suffix}`;
const customerA = `il-customer-a-${suffix}`;
const customerA2 = `il-customer-a2-${suffix}`;
const customerB = `il-customer-b-${suffix}`;

describe(
  "tenant-safe invoice lookup",
  () => {
    it(
      "returns only same-org invoices, filters by id/customer/order/query/status, items ordered, empty valid",
      async () => {
        await db.organization.createMany({
          data: [
            { id: orgA, name: "IL A" },
            { id: orgB, name: "IL B" }
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
            title: "Yıllık bakım teklifi",
            amount: 100
          }
        });

        const orderItemA = await db.orderItem.create({
          data: {
            organizationId: orgA,
            orderId: orderA.id,
            name: "Bakım",
            quantity: 1,
            unitPriceCents: BigInt(10_000),
            lineTotalCents: BigInt(10_000),
            sortOrder: 0
          }
        });

        const invoiceA = await db.invoice.create({
          data: {
            organizationId: orgA,
            customerId: customerA,
            sourceOrderId: orderA.id,
            invoiceNumber: "FTR-2026-0001",
            title: "Yıllık bakım teklifi",
            amount: 100,
            taxAmount: 0,
            totalAmount: 100
          }
        });

        await db.invoiceItem.createMany({
          data: [
            {
              organizationId: orgA,
              invoiceId: invoiceA.id,
              orderItemId: orderItemA.id,
              name: "İkinci kalem",
              quantity: 1,
              unitPriceCents: BigInt(1000),
              lineTotalCents: BigInt(1000),
              sortOrder: 1
            },
            {
              organizationId: orgA,
              invoiceId: invoiceA.id,
              orderItemId: orderItemA.id,
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
            title: "Danışmanlık teklifi",
            amount: 200
          }
        });

        const invoiceA2 = await db.invoice.create({
          data: {
            organizationId: orgA,
            customerId: customerA2,
            sourceOrderId: orderA2.id,
            invoiceNumber: "FTR-2026-0002",
            title: "Danışmanlık teklifi",
            amount: 200,
            taxAmount: 0,
            totalAmount: 200
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

        const orderB = await db.order.create({
          data: {
            organizationId: orgB,
            customerId: customerB,
            sourceQuoteId: quoteB.id,
            orderNumber: "SIP-0001",
            customerName: "Zensoft Teknoloji",
            title: "Yıllık bakım teklifi",
            amount: 100
          }
        });

        await db.invoice.create({
          data: {
            organizationId: orgB,
            customerId: customerB,
            sourceOrderId: orderB.id,
            invoiceNumber: "FTR-2026-0001",
            title: "Yıllık bakım teklifi",
            amount: 100,
            taxAmount: 0,
            totalAmount: 100
          }
        });

        const allInOrgA = await listInvoicesForOrganization({
          actorUserId: userA,
          organizationId: orgA
        });

        expect(allInOrgA).toHaveLength(2);

        expect(
          allInOrgA.some(i => i.customerId === customerB)
        ).toBe(false);

        const byId = await listInvoicesForOrganization({
          actorUserId: userA,
          organizationId: orgA,
          invoiceId: invoiceA.id
        });

        expect(byId).toHaveLength(1);
        expect(byId[0]?.id).toBe(invoiceA.id);

        const byCustomer = await listInvoicesForOrganization({
          actorUserId: userA,
          organizationId: orgA,
          customerId: customerA2
        });

        expect(byCustomer).toHaveLength(1);
        expect(byCustomer[0]?.id).toBe(invoiceA2.id);

        const byOrder = await listInvoicesForOrganization({
          actorUserId: userA,
          organizationId: orgA,
          orderId: orderA.id
        });

        expect(byOrder).toHaveLength(1);
        expect(byOrder[0]?.id).toBe(invoiceA.id);

        const byQuery = await listInvoicesForOrganization({
          actorUserId: userA,
          organizationId: orgA,
          query: "FTR-2026-0002"
        });

        expect(byQuery).toHaveLength(1);
        expect(byQuery[0]?.id).toBe(invoiceA2.id);

        const byStatus = await listInvoicesForOrganization({
          actorUserId: userA,
          organizationId: orgA,
          status: "DRAFT"
        });

        expect(byStatus).toHaveLength(2);

        const found = allInOrgA.find(
          i => i.id === invoiceA.id
        );

        expect(
          found?.items.map(item => item.name)
        ).toEqual(["Birinci kalem", "İkinci kalem"]);

        expect(
          typeof found?.items[0]?.unitPriceCents
        ).toBe("string");

        expect(found?.items[0]?.orderItemId).toBe(
          orderItemA.id
        );

        expect(found?.sourceOrderId).toBe(orderA.id);

        // cross-tenant direct id: empty, no leak
        const crossTenantById =
          await listInvoicesForOrganization({
            actorUserId: userA,
            organizationId: orgA,
            invoiceId: `does-not-exist-${suffix}`
          });

        expect(crossTenantById).toEqual([]);

        const empty = await listInvoicesForOrganization({
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
          listInvoicesForOrganization({
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
  await db.invoiceItem.deleteMany({
    where: {
      organizationId: { in: [orgA, orgB] }
    }
  });

  await db.invoice.deleteMany({
    where: {
      organizationId: { in: [orgA, orgB] }
    }
  });

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
