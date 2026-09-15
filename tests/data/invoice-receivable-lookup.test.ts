import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/data/invoice-receivable-lookup.ts"
);

const implementationExists = existsSync(implementationPath);

async function createInvoiceFixture(input: {
  db: typeof import("../../src/lib/db").db;
  suffix: string;
  totalAmount: number;
}) {
  const { db, suffix, totalAmount } = input;

  const organizationId = `irl-org-${suffix}`;
  const userId = `irl-user-${suffix}`;
  const customerId = `irl-customer-${suffix}`;

  await db.organization.create({
    data: { id: organizationId, name: "Receivable Lookup Tenant" }
  });
  await db.user.create({
    data: {
      id: userId,
      email: `${userId}@example.test`,
      name: "Receivable Lookup User"
    }
  });
  await db.organizationMember.create({
    data: { organizationId, userId, role: "MEMBER" }
  });
  await db.customer.create({
    data: { id: customerId, organizationId, name: "Alacak Müşterisi" }
  });

  const quote = await db.quote.create({
    data: {
      organizationId,
      customerId,
      customerName: "Alacak Müşterisi",
      title: "Alacak testi teklifi",
      status: "WON"
    }
  });

  const order = await db.order.create({
    data: {
      organizationId,
      customerId,
      sourceQuoteId: quote.id,
      orderNumber: `SIP-${suffix}`,
      customerName: "Alacak Müşterisi",
      title: "Alacak testi siparişi",
      amount: totalAmount
    }
  });

  const invoice = await db.invoice.create({
    data: {
      organizationId,
      customerId,
      sourceOrderId: order.id,
      invoiceNumber: `FTR-${suffix}`,
      title: "Alacak testi faturası",
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

describe("invoice receivable lookup (read-only)", () => {
  it("requires the implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it(
    "derives the full outstanding balance from Invoice truth before any Payment is materialized, then reflects a collection without itself mutating anything",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const {
        lookupInvoiceReceivable
      } = await import(
        "../../src/lib/data/invoice-receivable-lookup"
      );
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
        totalAmount: 6_000
      });

      try {
        const beforeAny = await lookupInvoiceReceivable({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          invoiceId: fixture.invoiceId
        });

        expect(beforeAny.paymentId).toBeNull();
        expect(beforeAny.receivableAmount).toBe(6_000);
        expect(beforeAny.collected).toBe(0);
        expect(beforeAny.outstanding).toBe(6_000);
        expect(beforeAny.collectionState).toBe("UNPAID");

        const paymentCountBeforeLookup = await db.payment.count({
          where: { organizationId: fixture.organizationId }
        });
        expect(paymentCountBeforeLookup).toBe(0);

        await executeCollectionRecord({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          idempotencyKey: `collect-${suffix}`,
          invoiceId: fixture.invoiceId,
          amount: 2_500
        });

        const afterPartial = await lookupInvoiceReceivable({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          invoiceId: fixture.invoiceId
        });

        expect(afterPartial.paymentId).not.toBeNull();
        expect(afterPartial.collected).toBe(2_500);
        expect(afterPartial.outstanding).toBe(3_500);
        expect(afterPartial.collectionState).toBe("PARTIAL");
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
        lookupInvoiceReceivable,
        InvoiceNotFoundError
      } = await import(
        "../../src/lib/data/invoice-receivable-lookup"
      );

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}-tenant`;

      const fixture = await createInvoiceFixture({
        db,
        suffix,
        totalAmount: 1_000
      });

      const otherOrgId = `irl-other-org-${suffix}`;
      const otherUserId = `irl-other-user-${suffix}`;

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
          lookupInvoiceReceivable({
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
