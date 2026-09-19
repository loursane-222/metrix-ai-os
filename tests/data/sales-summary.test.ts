import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/data/sales-summary.ts"
);

const implementationExists = existsSync(implementationPath);

async function createInvoiceFixture(input: {
  db: typeof import("../../src/lib/db").db;
  organizationId: string;
  customerId: string;
  suffix: string;
  totalAmount: number;
  createdAt: Date;
  currency?: string;
}) {
  const {
    db,
    organizationId,
    customerId,
    suffix,
    totalAmount,
    createdAt,
    currency = "TRY"
  } = input;

  const quote = await db.quote.create({
    data: {
      organizationId,
      customerId,
      customerName: "Satış Müşterisi",
      title: `Satış testi teklifi ${suffix}`,
      status: "WON",
      currency
    }
  });

  const order = await db.order.create({
    data: {
      organizationId,
      customerId,
      sourceQuoteId: quote.id,
      orderNumber: `SIP-${suffix}`,
      customerName: "Satış Müşterisi",
      title: `Satış testi siparişi ${suffix}`,
      amount: totalAmount,
      currency
    }
  });

  await db.invoice.create({
    data: {
      organizationId,
      customerId,
      sourceOrderId: order.id,
      invoiceNumber: `FTR-${suffix}`,
      title: `Satış testi faturası ${suffix}`,
      amount: totalAmount,
      taxAmount: totalAmount * 0.2,
      totalAmount: totalAmount * 1.2,
      currency,
      createdAt
    }
  });
}

describe("sales summary (period, read-only)", () => {
  it("requires the implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it(
    "sums only invoices created inside the given period, grouped by currency",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const { lookupSalesSummary } = await import(
        "../../src/lib/data/sales-summary"
      );

      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const organizationId = `ss-org-${suffix}`;
      const userId = `ss-user-${suffix}`;
      const customerId = `ss-customer-${suffix}`;

      await db.organization.create({
        data: { id: organizationId, name: "Sales Summary Tenant" }
      });
      await db.user.create({
        data: { id: userId, email: `${userId}@example.test`, name: "User" }
      });
      await db.organizationMember.create({
        data: { organizationId, userId, role: "MEMBER" }
      });
      await db.customer.create({
        data: { id: customerId, organizationId, name: "Satış Müşterisi" }
      });

      try {
        // inside period
        await createInvoiceFixture({
          db,
          organizationId,
          customerId,
          suffix: `in1-${suffix}`,
          totalAmount: 1_000,
          createdAt: new Date("2026-09-10T12:00:00.000Z")
        });

        await createInvoiceFixture({
          db,
          organizationId,
          customerId,
          suffix: `in2-${suffix}`,
          totalAmount: 2_000,
          createdAt: new Date("2026-09-20T12:00:00.000Z")
        });

        // outside period (before)
        await createInvoiceFixture({
          db,
          organizationId,
          customerId,
          suffix: `out-before-${suffix}`,
          totalAmount: 5_000,
          createdAt: new Date("2026-08-15T12:00:00.000Z")
        });

        // outside period (after)
        await createInvoiceFixture({
          db,
          organizationId,
          customerId,
          suffix: `out-after-${suffix}`,
          totalAmount: 7_000,
          createdAt: new Date("2026-10-01T12:00:00.000Z")
        });

        const summary = await lookupSalesSummary({
          actorUserId: userId,
          organizationId,
          periodStart: "2026-09-01T00:00:00.000Z",
          periodEnd: "2026-09-30T23:59:59.999Z"
        });

        expect(summary.byCurrency).toHaveLength(1);
        expect(summary.byCurrency[0]).toMatchObject({
          currency: "TRY",
          invoiceCount: 2,
          totalAmount: 3_000,
          totalTaxAmount: 600,
          totalWithTax: 3_600
        });
      } finally {
        await db.invoice.deleteMany({ where: { organizationId } });
        await db.order.deleteMany({ where: { organizationId } });
        await db.quote.deleteMany({ where: { organizationId } });
        await db.customer.deleteMany({ where: { organizationId } });
        await db.organizationMember.deleteMany({ where: { organizationId } });
        await db.user.deleteMany({ where: { id: userId } });
        await db.organization.deleteMany({ where: { id: organizationId } });
      }
    }
  );

  it("rejects an inverted period", async () => {
    expect(implementationExists).toBe(true);
    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const { lookupSalesSummary, InvalidSalesPeriodError } = await import(
      "../../src/lib/data/sales-summary"
    );

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-inv`;
    const organizationId = `ss-inv-org-${suffix}`;
    const userId = `ss-inv-user-${suffix}`;

    await db.organization.create({
      data: { id: organizationId, name: "Invalid Period Tenant" }
    });
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "User" }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });

    try {
      await expect(
        lookupSalesSummary({
          actorUserId: userId,
          organizationId,
          periodStart: "2026-09-30T00:00:00.000Z",
          periodEnd: "2026-09-01T00:00:00.000Z"
        })
      ).rejects.toBeInstanceOf(InvalidSalesPeriodError);
    } finally {
      await db.organizationMember.deleteMany({ where: { organizationId } });
      await db.user.deleteMany({ where: { id: userId } });
      await db.organization.deleteMany({ where: { id: organizationId } });
    }
  });
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
