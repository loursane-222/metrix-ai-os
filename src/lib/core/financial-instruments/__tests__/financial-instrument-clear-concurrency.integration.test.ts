import { describe, expect, it } from "vitest";

const databaseUrl = process.env.INSTRUMENT_CLEAR_CONCURRENCY_INTEGRATION_DATABASE_URL;

/**
 * Bkz. settlement-concurrency.integration.test.ts — aynı gerçek-Postgres,
 * env-var-gated desen. Mocked unit testlerin (financial-instrument.service.
 * test.ts) KANITLAYAMADIĞI şeyi kanıtlar: gerçek eşzamanlı transaction'lar
 * altında Postgres'in row-level kilidinin, aynı FinancialInstrument'ı
 * clearInstrument ile iki gerçek eşzamanlı çağrının ikisinin de gerçek para
 * hareketi üretmesini (double money movement) engellediğini doğrular.
 * Varsayılan test koşusunda (env var set değilken) skip edilir.
 */
describe.skipIf(!databaseUrl)("FinancialInstrument.clear concurrency against migrated PostgreSQL", () => {
  it("DOUBLE MONEY MOVEMENT GUARANTEE: two truly concurrent clearInstrument calls on the same instrument produce exactly one real Settlement", async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [{ prisma }, { registerInstrument, applyInstrumentToObligation, clearInstrument }, { materializeReceivableSchedule }, { sendInvoice, createNewInvoice }] = await Promise.all([
      import("@/lib/core/shared/prisma"),
      import("@/lib/core/financial-instruments/financial-instrument.service"),
      import("@/lib/core/obligations/obligation-schedule.service"),
      import("@/lib/core/invoices/invoice.service"),
    ]);

    const organization = await prisma.organization.create({ data: { name: `Instrument concurrency ${Date.now()}` } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: "Concurrency Test Customer" } });
    const account = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "BANK", name: "Ana Banka", normalizedName: "ana banka", currency: "TRY" } });

    const { invoice } = await createNewInvoice({ organizationId: organization.id, customerId: customer.id, title: "Test Invoice", amount: 1000 });
    await sendInvoice({ invoiceId: invoice.id, organizationId: organization.id });
    const { lines } = await materializeReceivableSchedule({ organizationId: organization.id, invoiceId: invoice.id, actorId: "test-actor", referenceDate: new Date() });
    const obligationLine = lines[0]!;

    const instrument = await registerInstrument({ organizationId: organization.id, instrumentType: "CHEQUE", direction: "RECEIVED", customerId: customer.id, amount: 500, maturityDate: new Date("2026-12-01"), actorId: "test-actor" });
    await applyInstrumentToObligation({ organizationId: organization.id, instrumentId: instrument.id, obligationScheduleLineId: obligationLine.id, amount: 500, actorId: "test-actor" });

    try {
      const attempt = () => clearInstrument({ organizationId: organization.id, instrumentId: instrument.id, paymentMethod: "BANK_TRANSFER", financialAccountReference: account.id, actorId: "test-actor" });

      const results = await Promise.allSettled([attempt(), attempt()]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const settlements = await prisma.settlement.findMany({ where: { organizationId: organization.id, paymentId: obligationLine.paymentId! } });
      expect(settlements).toHaveLength(1); // exactly one real Settlement ever committed, never two

      const movements = await prisma.financialAccountMovement.findMany({ where: { organizationId: organization.id, settlementId: settlements[0]!.id } });
      expect(movements).toHaveLength(1);

      const refreshedInstrument = await prisma.financialInstrument.findUniqueOrThrow({ where: { id: instrument.id } });
      expect(refreshedInstrument.status).toBe("CLEARED");
    } finally {
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.$disconnect();
    }
  });
});
