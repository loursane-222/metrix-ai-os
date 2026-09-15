import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/data/collection-lookup.ts"
);

const implementationExists = existsSync(implementationPath);

async function createInvoiceFixture(input: {
  db: typeof import("../../src/lib/db").db;
  suffix: string;
  totalAmount: number;
}) {
  const { db, suffix, totalAmount } = input;

  const organizationId = `cl-org-${suffix}`;
  const userId = `cl-user-${suffix}`;
  const customerId = `cl-customer-${suffix}`;

  await db.organization.create({
    data: { id: organizationId, name: "Collection Lookup Tenant" }
  });
  await db.user.create({
    data: {
      id: userId,
      email: `${userId}@example.test`,
      name: "Collection Lookup User"
    }
  });
  await db.organizationMember.create({
    data: { organizationId, userId, role: "MEMBER" }
  });
  await db.customer.create({
    data: { id: customerId, organizationId, name: "Tahsilat Müşterisi" }
  });

  const quote = await db.quote.create({
    data: {
      organizationId,
      customerId,
      customerName: "Tahsilat Müşterisi",
      title: "Tahsilat listesi teklifi",
      status: "WON"
    }
  });

  const order = await db.order.create({
    data: {
      organizationId,
      customerId,
      sourceQuoteId: quote.id,
      orderNumber: `SIP-${suffix}`,
      customerName: "Tahsilat Müşterisi",
      title: "Tahsilat listesi siparişi",
      amount: totalAmount
    }
  });

  const invoice = await db.invoice.create({
    data: {
      organizationId,
      customerId,
      sourceOrderId: order.id,
      invoiceNumber: `FTR-${suffix}`,
      title: "Tahsilat listesi faturası",
      amount: totalAmount,
      taxAmount: 0,
      totalAmount
    }
  });

  return { organizationId, userId, customerId, invoiceId: invoice.id };
}

async function cleanupFixture(input: {
  db: typeof import("../../src/lib/db").db;
  organizationIds: string[];
  userIds: string[];
}) {
  const { db, organizationIds, userIds } = input;

  await db.application.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.settlement.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.payment.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.invoice.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.order.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.quote.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.customer.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.organizationMember.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.organization.deleteMany({
    where: { id: { in: organizationIds } }
  });
}

describe("collection lookup (read-only)", () => {
  it("requires the implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it(
    "returns an empty ledger before any collection, then derives correct totals from persisted evidence after two collections",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const {
        listCollectionsForInvoice
      } = await import("../../src/lib/data/collection-lookup");
      const {
        executeCollectionRecord
      } = await import(
        "../../src/lib/actions/collection-record"
      );

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const fixture = await createInvoiceFixture({
        db,
        suffix,
        totalAmount: 9_000
      });

      try {
        const empty = await listCollectionsForInvoice({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          invoiceId: fixture.invoiceId
        });

        expect(empty.paymentId).toBeNull();
        expect(empty.collections).toEqual([]);
        expect(empty.totalCollected).toBe(0);
        expect(empty.outstanding).toBe(9_000);

        await executeCollectionRecord({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          idempotencyKey: `first-${suffix}`,
          invoiceId: fixture.invoiceId,
          amount: 3_000
        });

        await executeCollectionRecord({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          idempotencyKey: `second-${suffix}`,
          invoiceId: fixture.invoiceId,
          amount: 4_000
        });

        const ledger = await listCollectionsForInvoice({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          invoiceId: fixture.invoiceId
        });

        expect(ledger.paymentId).not.toBeNull();
        expect(ledger.collections).toHaveLength(2);
        expect(ledger.collections.map((c) => c.amount)).toEqual([
          3_000, 4_000
        ]);
        expect(
          ledger.collections.every((c) => c.kind === "ORIGINAL")
        ).toBe(true);
        expect(
          ledger.collections.every((c) => c.direction === "IN")
        ).toBe(true);
        expect(ledger.totalCollected).toBe(7_000);
        expect(ledger.outstanding).toBe(2_000);
        expect(ledger.collectionState).toBe("PARTIAL");
      } finally {
        await cleanupFixture({
          db,
          organizationIds: [fixture.organizationId],
          userIds: [fixture.userId]
        });
      }
    }
  );

  it(
    "enforces tenant isolation with a generic not-found",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const {
        listCollectionsForInvoice,
        InvoiceNotFoundError
      } = await import("../../src/lib/data/collection-lookup");

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}-tenant`;

      const fixture = await createInvoiceFixture({
        db,
        suffix,
        totalAmount: 1_000
      });

      const otherOrgId = `cl-other-org-${suffix}`;
      const otherUserId = `cl-other-user-${suffix}`;

      await db.organization.create({
        data: { id: otherOrgId, name: "Other Tenant" }
      });
      await db.user.create({
        data: {
          id: otherUserId,
          email: `${otherUserId}@example.test`,
          name: "Other Org User"
        }
      });
      await db.organizationMember.create({
        data: {
          organizationId: otherOrgId,
          userId: otherUserId,
          role: "MEMBER"
        }
      });

      try {
        await expect(
          listCollectionsForInvoice({
            actorUserId: otherUserId,
            organizationId: otherOrgId,
            invoiceId: fixture.invoiceId
          })
        ).rejects.toBeInstanceOf(InvoiceNotFoundError);
      } finally {
        await cleanupFixture({
          db,
          organizationIds: [fixture.organizationId, otherOrgId],
          userIds: [fixture.userId, otherUserId]
        });
      }
    }
  );
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
