import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/data/receivables-summary.ts"
);

const implementationExists = existsSync(implementationPath);

async function createInvoiceFixture(input: {
  db: typeof import("../../src/lib/db").db;
  organizationId: string;
  customerId: string;
  customerName: string;
  suffix: string;
  totalAmount: number;
}) {
  const { db, organizationId, customerId, customerName, suffix, totalAmount } =
    input;

  const quote = await db.quote.create({
    data: {
      organizationId,
      customerId,
      customerName,
      title: `${customerName} teklifi`,
      status: "WON"
    }
  });

  const order = await db.order.create({
    data: {
      organizationId,
      customerId,
      sourceQuoteId: quote.id,
      orderNumber: `SIP-${suffix}`,
      customerName,
      title: `${customerName} siparişi`,
      amount: totalAmount
    }
  });

  const invoice = await db.invoice.create({
    data: {
      organizationId,
      customerId,
      sourceOrderId: order.id,
      invoiceNumber: `FTR-${suffix}`,
      title: `${customerName} faturası`,
      amount: totalAmount,
      taxAmount: 0,
      totalAmount
    }
  });

  return invoice.id;
}

describe("receivables summary (org-wide, read-only)", () => {
  it("requires the implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it(
    "aggregates outstanding balance by currency and lists unpaid/partial invoices, excluding fully paid ones",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const { lookupReceivablesSummary } = await import(
        "../../src/lib/data/receivables-summary"
      );
      const { executeCollectionRecord } = await import(
        "../../src/lib/actions/collection-record"
      );

      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const organizationId = `rs-org-${suffix}`;
      const userId = `rs-user-${suffix}`;
      const customerAId = `rs-customer-a-${suffix}`;
      const customerBId = `rs-customer-b-${suffix}`;

      await db.organization.create({
        data: { id: organizationId, name: "Receivables Summary Tenant" }
      });
      await db.user.create({
        data: { id: userId, email: `${userId}@example.test`, name: "User" }
      });
      await db.organizationMember.create({
        data: { organizationId, userId, role: "MEMBER" }
      });
      await db.customer.create({
        data: { id: customerAId, organizationId, name: "Alacaklı A" }
      });
      await db.customer.create({
        data: { id: customerBId, organizationId, name: "Alacaklı B" }
      });

      try {
        const unpaidInvoiceId = await createInvoiceFixture({
          db,
          organizationId,
          customerId: customerAId,
          customerName: "Alacaklı A",
          suffix: `unpaid-${suffix}`,
          totalAmount: 4_000
        });

        const partialInvoiceId = await createInvoiceFixture({
          db,
          organizationId,
          customerId: customerBId,
          customerName: "Alacaklı B",
          suffix: `partial-${suffix}`,
          totalAmount: 10_000
        });

        const paidInvoiceId = await createInvoiceFixture({
          db,
          organizationId,
          customerId: customerAId,
          customerName: "Alacaklı A",
          suffix: `paid-${suffix}`,
          totalAmount: 1_000
        });

        await executeCollectionRecord({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `collect-partial-${suffix}`,
          invoiceId: partialInvoiceId,
          amount: 3_000
        });

        await executeCollectionRecord({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `collect-paid-${suffix}`,
          invoiceId: paidInvoiceId,
          amount: 1_000
        });

        const summary = await lookupReceivablesSummary({
          actorUserId: userId,
          organizationId
        });

        expect(summary.byCurrency).toHaveLength(1);
        expect(summary.byCurrency[0]).toMatchObject({
          currency: "TRY",
          invoiceCount: 3,
          totalInvoiced: 15_000,
          totalCollected: 4_000,
          totalOutstanding: 11_000,
          unpaidCount: 1,
          partialCount: 1,
          paidCount: 1
        });

        expect(summary.outstandingInvoices).toHaveLength(2);
        expect(
          summary.outstandingInvoices.some(
            row => row.invoiceId === paidInvoiceId
          )
        ).toBe(false);

        const byId = new Map(
          summary.outstandingInvoices.map(row => [row.invoiceId, row])
        );

        expect(byId.get(unpaidInvoiceId)).toMatchObject({
          customerId: customerAId,
          customerName: "Alacaklı A",
          outstanding: 4_000,
          collectionState: "UNPAID"
        });

        expect(byId.get(partialInvoiceId)).toMatchObject({
          customerId: customerBId,
          customerName: "Alacaklı B",
          outstanding: 7_000,
          collectionState: "PARTIAL"
        });

        // sorted by outstanding desc: partial (7,000) before unpaid (4,000)
        expect(summary.outstandingInvoices[0]?.invoiceId).toBe(
          partialInvoiceId
        );
      } finally {
        await db.application.deleteMany({ where: { organizationId } });
        await db.settlement.deleteMany({ where: { organizationId } });
        await db.payment.deleteMany({ where: { organizationId } });
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

  it("returns an empty summary for an organization with no invoices", async () => {
    expect(implementationExists).toBe(true);
    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const { lookupReceivablesSummary } = await import(
      "../../src/lib/data/receivables-summary"
    );

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-empty`;
    const organizationId = `rs-empty-org-${suffix}`;
    const userId = `rs-empty-user-${suffix}`;

    await db.organization.create({
      data: { id: organizationId, name: "Empty Receivables Tenant" }
    });
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "User" }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });

    try {
      const summary = await lookupReceivablesSummary({
        actorUserId: userId,
        organizationId
      });

      expect(summary.byCurrency).toEqual([]);
      expect(summary.outstandingInvoices).toEqual([]);
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
