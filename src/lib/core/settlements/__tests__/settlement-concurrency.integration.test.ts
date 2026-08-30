import { describe, expect, it } from "vitest";

const databaseUrl = process.env.SETTLEMENT_CONCURRENCY_INTEGRATION_DATABASE_URL;

/**
 * Bkz. ledger.integration.test.ts / payment-invoice.integration.test.ts —
 * aynı gerçek-Postgres, env-var-gated desen. Bu dosya, mocked unit
 * testlerin KANITLAYAMADIĞI şeyi kanıtlar: gerçek eşzamanlı transaction'lar
 * altında Postgres'in unique index + row-level locking davranışının,
 * Settlement idempotency replay ve Payment over-application ceiling
 * invariant'larını gerçekten koruduğu. Varsayılan test koşusunda
 * (SETTLEMENT_CONCURRENCY_INTEGRATION_DATABASE_URL set değilken) skip
 * edilir — CI'da veya bu env var'la manuel çalıştırılabilir.
 */
describe.skipIf(!databaseUrl)("Settlement concurrency against migrated PostgreSQL", () => {
  it("CONCURRENT IDEMPOTENCY GUARANTEE: two truly concurrent requests with the same idempotencyKey commit exactly one Settlement", async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [{ prisma }, { applySettlement }] = await Promise.all([
      import("@/lib/core/shared/prisma"),
      import("@/lib/core/settlements/settlement.service"),
    ]);

    const organization = await prisma.organization.create({ data: { name: `Settlement concurrency idempotency ${Date.now()}` } });
    const account = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "CASH", name: "Ana Kasa", normalizedName: "ana kasa", currency: "TRY" } });
    const payment = await prisma.payment.create({ data: { organizationId: organization.id, title: "Concurrency validation payment", amount: 1000, currency: "TRY" } });

    try {
      const attempt = () =>
        applySettlement({
          organizationId: organization.id, paymentId: payment.id, amount: 300, paymentMethod: "CASH", financialAccountReference: account.id,
          idempotencyKey: "concurrency-key-1", actorId: "test-actor",
        });

      const [a, b] = await Promise.all([attempt(), attempt()]);

      expect(a?.settlement.id).toBe(b?.settlement.id);
      expect([a?.replayed, b?.replayed].sort()).toEqual([false, true]);

      const settlements = await prisma.settlement.findMany({ where: { organizationId: organization.id, paymentId: payment.id, idempotencyKey: "concurrency-key-1" } });
      expect(settlements).toHaveLength(1);

      const refreshedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(Number(refreshedPayment.paidAmount)).toBe(300);
    } finally {
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.$disconnect();
    }
  });

  it("CONCURRENT APPLICATION CEILING: two truly concurrent requests that would together exceed the payment amount never both succeed", async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [{ prisma }, { applySettlement }] = await Promise.all([
      import("@/lib/core/shared/prisma"),
      import("@/lib/core/settlements/settlement.service"),
    ]);

    const organization = await prisma.organization.create({ data: { name: `Settlement concurrency ceiling ${Date.now()}` } });
    const account = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "CASH", name: "Ana Kasa", normalizedName: "ana kasa", currency: "TRY" } });
    const payment = await prisma.payment.create({ data: { organizationId: organization.id, title: "Concurrency ceiling payment", amount: 1000, currency: "TRY" } });

    try {
      const attempt = () =>
        applySettlement({ organizationId: organization.id, paymentId: payment.id, amount: 600, paymentMethod: "CASH", financialAccountReference: account.id, actorId: "test-actor" });

      const results = await Promise.allSettled([attempt(), attempt()]);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const applications = await prisma.application.findMany({ where: { organizationId: organization.id, paymentId: payment.id, kind: "ORIGINAL" } });
      const totalApplied = applications.reduce((sum, application) => sum + Number(application.amount), 0);
      expect(totalApplied).toBeLessThanOrEqual(1000);
      expect(totalApplied).toBe(600); // exactly one 600 application ever committed, never 1200

      const refreshedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(Number(refreshedPayment.paidAmount)).toBe(600);
    } finally {
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.$disconnect();
    }
  });
});
