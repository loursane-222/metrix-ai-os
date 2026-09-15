import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/actions/collection-record.ts"
);

const implementationExists = existsSync(implementationPath);

async function createInvoiceFixture(input: {
  db: typeof import("../../src/lib/db").db;
  suffix: string;
  totalAmount: number;
  currency?: string;
}) {
  const { db, suffix, totalAmount, currency } = input;

  const organizationId = `cr-org-${suffix}`;
  const userId = `cr-user-${suffix}`;
  const customerId = `cr-customer-${suffix}`;

  await db.organization.create({
    data: { id: organizationId, name: "Collection Tenant" }
  });

  await db.user.create({
    data: {
      id: userId,
      email: `${userId}@example.test`,
      name: "Collection User"
    }
  });

  await db.organizationMember.create({
    data: { organizationId, userId, role: "MEMBER" }
  });

  await db.customer.create({
    data: {
      id: customerId,
      organizationId,
      name: "Zensoft Teknoloji A.Ş."
    }
  });

  const quote = await db.quote.create({
    data: {
      organizationId,
      customerId,
      customerName: "Zensoft Teknoloji A.Ş.",
      title: "Tahsilat testi teklifi",
      status: "WON"
    }
  });

  const order = await db.order.create({
    data: {
      organizationId,
      customerId,
      sourceQuoteId: quote.id,
      orderNumber: `SIP-${suffix}`,
      customerName: "Zensoft Teknoloji A.Ş.",
      title: "Tahsilat testi siparişi",
      amount: totalAmount,
      currency: currency ?? "TRY"
    }
  });

  const invoice = await db.invoice.create({
    data: {
      organizationId,
      customerId,
      sourceOrderId: order.id,
      invoiceNumber: `FTR-${suffix}`,
      title: "Tahsilat testi faturası",
      amount: totalAmount,
      taxAmount: 0,
      totalAmount,
      currency: currency ?? "TRY"
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
  await db.actionExecution.deleteMany({
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
  await db.user.deleteMany({
    where: { id: { in: userIds } }
  });
  await db.organization.deleteMany({
    where: { id: { in: organizationIds } }
  });
}

describe("verified collection.record action", () => {
  it("requires the typed collection.record implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it(
    "materializes exactly one Payment receivable from Invoice truth (idempotently and concurrency-safely), then converges a partial collection to exact outstanding",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
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
        totalAmount: 12_000
      });

      try {
        // --- two concurrent materialization attempts must yield exactly
        // one Payment (no unique DB constraint on invoiceId — see spec
        // section 5/6 — so this proves the Invoice row lock discipline) ---
        const [a, b] = await Promise.all([
          executeCollectionRecord({
            actorUserId: fixture.userId,
            organizationId: fixture.organizationId,
            idempotencyKey: `materialize-a-${suffix}`,
            invoiceId: fixture.invoiceId,
            amount: 3_000
          }),
          executeCollectionRecord({
            actorUserId: fixture.userId,
            organizationId: fixture.organizationId,
            idempotencyKey: `materialize-b-${suffix}`,
            invoiceId: fixture.invoiceId,
            amount: 2_000
          })
        ]);

        expect(a.collection.paymentId).toBe(
          b.collection.paymentId
        );

        const paymentCount = await db.payment.count({
          where: {
            organizationId: fixture.organizationId,
            invoiceId: fixture.invoiceId
          }
        });
        expect(paymentCount).toBe(1);

        const payment = await db.payment.findFirstOrThrow({
          where: {
            organizationId: fixture.organizationId,
            invoiceId: fixture.invoiceId
          }
        });

        expect(Number(payment.amount)).toBe(12_000);
        expect(payment.customerId).toBe(fixture.customerId);
        expect(payment.currency).toBe("TRY");
        expect(Number(payment.paidAmount)).toBe(5_000);
        expect(payment.paidAt).toBeNull();

        // --- exact-replay: same idempotencyKey must not duplicate ---
        const replay = await executeCollectionRecord({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          idempotencyKey: `materialize-a-${suffix}`,
          invoiceId: fixture.invoiceId,
          amount: 3_000
        });

        expect(replay.replayed).toBe(true);
        expect(replay.collection.settlementId).toBe(
          a.collection.settlementId
        );

        const settlementCountAfterReplay =
          await db.settlement.count({
            where: { organizationId: fixture.organizationId }
          });
        expect(settlementCountAfterReplay).toBe(2);

        // --- cross-turn intentional second collection ---
        const second = await executeCollectionRecord({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          idempotencyKey: `second-turn-${suffix}`,
          invoiceId: fixture.invoiceId,
          amount: 7_000
        });

        expect(second.replayed).toBe(false);
        expect(second.collection.collected).toBe(12_000);
        expect(second.collection.outstanding).toBe(0);
        expect(second.collection.collectionState).toBe("PAID");

        const finalPayment = await db.payment.findFirstOrThrow({
          where: { id: payment.id }
        });
        expect(Number(finalPayment.paidAmount)).toBe(12_000);
        expect(finalPayment.paidAt).not.toBeNull();

        const settlementCount = await db.settlement.count({
          where: { organizationId: fixture.organizationId }
        });
        expect(settlementCount).toBe(3);

        const applicationCount = await db.application.count({
          where: { organizationId: fixture.organizationId }
        });
        expect(applicationCount).toBe(3);
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
    "fails closed on overpayment, zero, and negative amounts without mutating any financial state",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const {
        executeCollectionRecord,
        CollectionExceedsOutstandingError
      } = await import(
        "../../src/lib/actions/collection-record"
      );

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}-guard`;

      const fixture = await createInvoiceFixture({
        db,
        suffix,
        totalAmount: 5_000
      });

      try {
        const first = await executeCollectionRecord({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          idempotencyKey: `guard-first-${suffix}`,
          invoiceId: fixture.invoiceId,
          amount: 2_000
        });

        expect(first.collection.outstanding).toBe(3_000);

        await expect(
          executeCollectionRecord({
            actorUserId: fixture.userId,
            organizationId: fixture.organizationId,
            idempotencyKey: `guard-over-${suffix}`,
            invoiceId: fixture.invoiceId,
            amount: 3_000.01
          })
        ).rejects.toBeInstanceOf(
          CollectionExceedsOutstandingError
        );

        await expect(
          executeCollectionRecord({
            actorUserId: fixture.userId,
            organizationId: fixture.organizationId,
            idempotencyKey: `guard-zero-${suffix}`,
            invoiceId: fixture.invoiceId,
            amount: 0
          })
        ).rejects.toThrow();

        await expect(
          executeCollectionRecord({
            actorUserId: fixture.userId,
            organizationId: fixture.organizationId,
            idempotencyKey: `guard-negative-${suffix}`,
            invoiceId: fixture.invoiceId,
            amount: -100
          })
        ).rejects.toThrow();

        const settlementCount = await db.settlement.count({
          where: { organizationId: fixture.organizationId }
        });
        expect(settlementCount).toBe(1);

        const payment = await db.payment.findFirstOrThrow({
          where: {
            organizationId: fixture.organizationId,
            invoiceId: fixture.invoiceId
          }
        });
        expect(Number(payment.paidAmount)).toBe(2_000);
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
    "handles a genuine concurrent over-collection race: combined amount exceeds outstanding, so exactly one of the two commits",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const {
        executeCollectionRecord
      } = await import(
        "../../src/lib/actions/collection-record"
      );

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}-race`;

      const fixture = await createInvoiceFixture({
        db,
        suffix,
        totalAmount: 5_000
      });

      try {
        const [settledA, settledB] = await Promise.allSettled([
          executeCollectionRecord({
            actorUserId: fixture.userId,
            organizationId: fixture.organizationId,
            idempotencyKey: `race-a-${suffix}`,
            invoiceId: fixture.invoiceId,
            amount: 4_000
          }),
          executeCollectionRecord({
            actorUserId: fixture.userId,
            organizationId: fixture.organizationId,
            idempotencyKey: `race-b-${suffix}`,
            invoiceId: fixture.invoiceId,
            amount: 4_000
          })
        ]);

        const outcomes = [settledA, settledB];
        const fulfilled = outcomes.filter(
          (o) => o.status === "fulfilled"
        );
        const rejected = outcomes.filter(
          (o) => o.status === "rejected"
        );

        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        const payment = await db.payment.findFirstOrThrow({
          where: {
            organizationId: fixture.organizationId,
            invoiceId: fixture.invoiceId
          }
        });

        expect(Number(payment.paidAmount)).toBe(4_000);

        const applications = await db.application.findMany({
          where: {
            organizationId: fixture.organizationId,
            paymentId: payment.id
          }
        });

        expect(applications).toHaveLength(1);

        const netCollected = applications.reduce(
          (sum, application) => sum + Number(application.amount),
          0
        );
        expect(netCollected).toBe(4_000);
        expect(5_000 - netCollected).toBeGreaterThanOrEqual(0);
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
    "enforces tenant isolation: a foreign organization cannot see or collect against the invoice, generically",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const {
        executeCollectionRecord,
        InvoiceNotFoundError
      } = await import(
        "../../src/lib/actions/collection-record"
      );

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}-tenant`;

      const fixture = await createInvoiceFixture({
        db,
        suffix,
        totalAmount: 1_000
      });

      const otherOrgId = `cr-other-org-${suffix}`;
      const otherUserId = `cr-other-user-${suffix}`;

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
          executeCollectionRecord({
            actorUserId: otherUserId,
            organizationId: otherOrgId,
            idempotencyKey: `tenant-leak-${suffix}`,
            invoiceId: fixture.invoiceId,
            amount: 100
          })
        ).rejects.toBeInstanceOf(InvoiceNotFoundError);

        const leaked = await db.payment.count({
          where: { organizationId: otherOrgId }
        });
        expect(leaked).toBe(0);
      } finally {
        await cleanupFixture({
          db,
          organizationIds: [fixture.organizationId, otherOrgId],
          userIds: [fixture.userId, otherUserId]
        });
      }
    }
  );

  it(
    "VERIFIED readback exactly matches persisted evidence",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const {
        executeCollectionRecord
      } = await import(
        "../../src/lib/actions/collection-record"
      );

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}-verify`;

      const fixture = await createInvoiceFixture({
        db,
        suffix,
        totalAmount: 4_000
      });

      try {
        const result = await executeCollectionRecord({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          idempotencyKey: `verify-${suffix}`,
          invoiceId: fixture.invoiceId,
          amount: 1_500
        });

        expect(result.status).toBe("VERIFIED");
        expect(result.verified).toBe(true);
        expect(result.collection.amount).toBe(1_500);
        expect(result.collection.receivableAmount).toBe(4_000);
        expect(result.collection.collected).toBe(1_500);
        expect(result.collection.outstanding).toBe(2_500);
        expect(result.collection.collectionState).toBe("PARTIAL");
        expect(result.collection.currency).toBe("TRY");

        const execution = await db.actionExecution.findUnique({
          where: {
            organizationId_actionType_idempotencyKey: {
              organizationId: fixture.organizationId,
              actionType: "collection.record",
              idempotencyKey: `verify-${suffix}`
            }
          }
        });

        expect(execution?.status).toBe("VERIFIED");
        expect(execution?.verifiedAt).not.toBeNull();
      } finally {
        await cleanupFixture({
          db,
          organizationIds: [fixture.organizationId],
          userIds: [fixture.userId]
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
