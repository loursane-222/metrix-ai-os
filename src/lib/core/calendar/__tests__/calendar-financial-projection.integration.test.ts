import { describe, expect, it } from "vitest";

const databaseUrl = process.env.CALENDAR_PROJECTION_INTEGRATION_DATABASE_URL;

/**
 * Real-Postgres, env-var-gated (bkz. settlement-concurrency.integration.test.ts).
 * Kanıtlar: projection canonical authority'den türer, hiçbir yerde
 * persisted/duplicate/stale değildir; partial/settled/cancelled/bounced
 * durumları doğru yansır; organization isolation korunur.
 */
describe.skipIf(!databaseUrl)("Calendar financial projection against migrated PostgreSQL", () => {
  async function setup() {
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = await import("@/lib/core/shared/prisma");
    const organization = await prisma.organization.create({ data: { name: `Calendar projection integration ${Date.now()}-${Math.random()}` } });
    const account = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "CASH", name: "Ana Kasa", normalizedName: "ana kasa", currency: "TRY" } });
    return { prisma, organization, account };
  }

  async function cleanup(prisma: Awaited<ReturnType<typeof setup>>["prisma"], organizationId: string) {
    await prisma.financialAccountMovement.deleteMany({ where: { organizationId } });
    await prisma.instrumentAllocation.deleteMany({ where: { organizationId } });
    await prisma.instrumentStatusHistory.deleteMany({ where: { organizationId } });
    await prisma.financialInstrument.deleteMany({ where: { organizationId } });
    await prisma.application.deleteMany({ where: { organizationId } });
    await prisma.settlement.deleteMany({ where: { organizationId } });
    await prisma.expenseSettlement.deleteMany({ where: { organizationId } });
    await prisma.obligationScheduleLine.deleteMany({ where: { organizationId } });
    await prisma.payment.deleteMany({ where: { organizationId } });
    await prisma.expense.deleteMany({ where: { organizationId } });
    await prisma.ledgerEntry.deleteMany({ where: { organizationId } });
    await prisma.financialAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  }

  it("PARTIAL → SETTLED: an expense payable appears with the correct remaining amount, then disappears once fully paid", async () => {
    const { prisma, organization, account } = await setup();
    const { createExpense } = await import("@/lib/core/expenses/expense-repository");
    const { materializePayableSchedule } = await import("@/lib/core/obligations/obligation-schedule.service");
    const { settleExpense } = await import("@/lib/core/expenses/expense-settlement.service");
    const { computeFinancialObligationProjections } = await import("../calendar-financial-projection.service");
    try {
      const dueDate = new Date("2026-09-10T00:00:00.000Z");
      const expense = await createExpense({ organizationId: organization.id, title: "Ofis kirası", category: "RENT", amount: 1000, currency: "TRY", expenseDate: new Date("2026-09-01T00:00:00.000Z") });
      await materializePayableSchedule({ organizationId: organization.id, expenseId: expense.id, dueDate, actorId: "test-actor" });

      const rangeStart = new Date("2026-09-01T00:00:00.000Z");
      const rangeEnd = new Date("2026-09-30T23:59:59.000Z");

      const before = await computeFinancialObligationProjections({ organizationId: organization.id, dueDateFrom: rangeStart, dueDateTo: rangeEnd, now: new Date("2026-09-05T00:00:00.000Z") });
      expect(before).toHaveLength(1);
      expect(before[0]!.amount).toBe(1000);
      expect(before[0]!.status).toBe("FUTURE"); // due 2026-09-10, "now" 2026-09-05, outside the default 3-day upcoming window

      await settleExpense({ organizationId: organization.id, expenseId: expense.id, amount: 400, paymentMethod: "CASH", financialAccountReference: account.id, actorId: "test-actor" });
      const afterPartial = await computeFinancialObligationProjections({ organizationId: organization.id, dueDateFrom: rangeStart, dueDateTo: rangeEnd, now: new Date("2026-09-05T00:00:00.000Z") });
      expect(afterPartial).toHaveLength(1);
      expect(afterPartial[0]!.amount).toBe(600);

      await settleExpense({ organizationId: organization.id, expenseId: expense.id, amount: 600, paymentMethod: "CASH", financialAccountReference: account.id, actorId: "test-actor" });
      const afterFull = await computeFinancialObligationProjections({ organizationId: organization.id, dueDateFrom: rangeStart, dueDateTo: rangeEnd, now: new Date("2026-09-05T00:00:00.000Z") });
      expect(afterFull).toHaveLength(0);
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("CANCELLED: a cancelled expense with no payments never appears, even with a materialized schedule line", async () => {
    const { prisma, organization } = await setup();
    const { createExpense, cancelExpense } = await import("@/lib/core/expenses/expense-repository");
    const { materializePayableSchedule } = await import("@/lib/core/obligations/obligation-schedule.service");
    const { computeFinancialObligationProjections } = await import("../calendar-financial-projection.service");
    try {
      const dueDate = new Date("2026-09-10T00:00:00.000Z");
      const expense = await createExpense({ organizationId: organization.id, title: "İptal edilecek gider", category: "OTHER", amount: 500, currency: "TRY", expenseDate: new Date("2026-09-01T00:00:00.000Z") });
      await materializePayableSchedule({ organizationId: organization.id, expenseId: expense.id, dueDate, actorId: "test-actor" });
      await cancelExpense({ id: expense.id, organizationId: organization.id, reason: "iptal" });

      const items = await computeFinancialObligationProjections({ organizationId: organization.id, dueDateFrom: new Date("2026-09-01T00:00:00.000Z"), dueDateTo: new Date("2026-09-30T23:59:59.000Z"), now: new Date("2026-09-05T00:00:00.000Z") });
      expect(items).toHaveLength(0);
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("BOUNCED INSTRUMENT REOPENS THE UNDERLYING OBLIGATION: a received cheque that bounces removes the instrument from projection and reinstates the receivable", async () => {
    const { prisma, organization } = await setup();
    const { createPayment } = await import("@/lib/core/payments/payment.repository");
    const { registerInstrument, applyInstrumentToObligation, bounceInstrument } = await import("@/lib/core/financial-instruments/financial-instrument.service");
    const { computeFinancialObligationProjections } = await import("../calendar-financial-projection.service");
    try {
      const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: "Test Müşteri" } });
      const dueDate = new Date("2026-09-15T00:00:00.000Z");
      const payment = await createPayment({ organizationId: organization.id, customerId: customer.id, personId: null, quoteId: null, invoiceId: null, title: "Test Fatura", amount: 800, currency: "TRY", dueDate });
      const line = await prisma.obligationScheduleLine.create({ data: { organizationId: organization.id, direction: "RECEIVABLE", sourceType: "INVOICE", sourceId: "manual-invoice-1", componentIndex: 0, allocationType: "REMAINDER", maturityBasis: "FIXED_DATE", dueDate, originalAmount: 800, currency: "TRY", paymentId: payment.id, actorId: "test-actor" } });

      const rangeStart = new Date("2026-09-01T00:00:00.000Z");
      const rangeEnd = new Date("2026-09-30T23:59:59.000Z");
      const now = new Date("2026-09-05T00:00:00.000Z");

      const beforeInstrument = await computeFinancialObligationProjections({ organizationId: organization.id, dueDateFrom: rangeStart, dueDateTo: rangeEnd, now });
      expect(beforeInstrument).toHaveLength(1); // the receivable itself
      expect(beforeInstrument[0]!.id).toBe(`obligation:${line.id}`);

      const instrument = await registerInstrument({ organizationId: organization.id, instrumentType: "CHEQUE", direction: "RECEIVED", customerId: customer.id, amount: 800, currency: "TRY", maturityDate: dueDate, actorId: "test-actor" });
      await applyInstrumentToObligation({ organizationId: organization.id, instrumentId: instrument.id, obligationScheduleLineId: line.id, amount: 800, actorId: "test-actor" });

      // Applying (not clearing) an instrument doesn't touch Payment.paidAmount, so the receivable
      // itself is untouched by our projection (it only reads Payment, not InstrumentAllocation) —
      // this documents that instruments are projected as their OWN item, not by suppressing the
      // underlying obligation, matching "allocation ≠ settlement".
      const afterAllocate = await computeFinancialObligationProjections({ organizationId: organization.id, dueDateFrom: rangeStart, dueDateTo: rangeEnd, now });
      const instrumentItem = afterAllocate.find((item) => item.id === `instrument:${instrument.id}`);
      expect(instrumentItem).toBeDefined();
      expect(instrumentItem!.amount).toBe(800);

      await bounceInstrument({ organizationId: organization.id, instrumentId: instrument.id, reason: "karşılıksız", actorId: "test-actor" });

      const afterBounce = await computeFinancialObligationProjections({ organizationId: organization.id, dueDateFrom: rangeStart, dueDateTo: rangeEnd, now });
      expect(afterBounce.find((item) => item.id === `instrument:${instrument.id}`)).toBeUndefined(); // bounced instrument itself is gone
      expect(afterBounce.find((item) => item.id === `obligation:${line.id}`)).toBeDefined(); // underlying receivable is still/again outstanding
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("ORGANIZATION ISOLATION: an obligation in org A never appears in org B's projection", async () => {
    const { prisma, organization: orgA, account: accountA } = await setup();
    const orgB = await prisma.organization.create({ data: { name: `Calendar projection isolation B ${Date.now()}-${Math.random()}` } });
    const { createExpense } = await import("@/lib/core/expenses/expense-repository");
    const { materializePayableSchedule } = await import("@/lib/core/obligations/obligation-schedule.service");
    const { computeFinancialObligationProjections } = await import("../calendar-financial-projection.service");
    try {
      const dueDate = new Date("2026-09-10T00:00:00.000Z");
      const expense = await createExpense({ organizationId: orgA.id, title: "Sadece A'ya ait", category: "OTHER", amount: 300, currency: "TRY", expenseDate: new Date("2026-09-01T00:00:00.000Z") });
      await materializePayableSchedule({ organizationId: orgA.id, expenseId: expense.id, dueDate, actorId: "test-actor" });

      const range = { dueDateFrom: new Date("2026-09-01T00:00:00.000Z"), dueDateTo: new Date("2026-09-30T23:59:59.000Z"), now: new Date("2026-09-05T00:00:00.000Z") };
      const itemsA = await computeFinancialObligationProjections({ organizationId: orgA.id, ...range });
      const itemsB = await computeFinancialObligationProjections({ organizationId: orgB.id, ...range });

      expect(itemsA).toHaveLength(1);
      expect(itemsB).toHaveLength(0);
    } finally {
      void accountA;
      await prisma.organization.delete({ where: { id: orgB.id } });
      await cleanup(prisma, orgA.id);
    }
  });
});
