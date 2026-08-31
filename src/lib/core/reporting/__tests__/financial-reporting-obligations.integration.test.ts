import { describe, expect, it } from "vitest";

const databaseUrl = process.env.FINANCIAL_REPORTING_OBLIGATIONS_INTEGRATION_DATABASE_URL;

/**
 * Real-Postgres, env-var-gated. Kanıtlar: forecast cash flow ve
 * receivable/payable aging yalnız canonical ObligationScheduleLine'dan
 * türer; partial settlement doğru netleşir, cancelled hariç tutulur,
 * reversal yeniden açar, instrument allocation altındaki obligation'ı
 * double-count etmez, timezone midnight boundary doğru çalışır.
 */
describe.skipIf(!databaseUrl)("Forecast cash flow / aging against migrated PostgreSQL", () => {
  async function setup() {
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = await import("@/lib/core/shared/prisma");
    const organization = await prisma.organization.create({ data: { name: `Financial reporting obligations integration ${Date.now()}-${Math.random()}` } });
    const account = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "CASH", name: "Ana Kasa", normalizedName: "ana kasa", currency: "TRY" } });
    return { prisma, organization, account };
  }

  async function cleanup(prisma: Awaited<ReturnType<typeof setup>>["prisma"], organizationId: string) {
    await prisma.financialAccountMovement.deleteMany({ where: { organizationId } });
    await prisma.instrumentAllocation.deleteMany({ where: { organizationId } });
    await prisma.instrumentStatusHistory.deleteMany({ where: { organizationId } });
    await prisma.financialInstrument.deleteMany({ where: { organizationId } });
    await prisma.expenseSettlement.deleteMany({ where: { organizationId } });
    await prisma.obligationScheduleLine.deleteMany({ where: { organizationId } });
    await prisma.payment.deleteMany({ where: { organizationId } });
    await prisma.expense.deleteMany({ where: { organizationId } });
    await prisma.ledgerEntry.deleteMany({ where: { organizationId } });
    await prisma.financialAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  }

  it("PARTIAL / CANCELLED / REVERSAL: forecast and payable aging reflect exactly the current remaining state", async () => {
    const { prisma, organization, account } = await setup();
    const { createExpense, cancelExpense } = await import("@/lib/core/expenses/expense-repository");
    const { materializePayableSchedule } = await import("@/lib/core/obligations/obligation-schedule.service");
    const { settleExpense, reverseExpenseSettlement } = await import("@/lib/core/expenses/expense-settlement.service");
    const { computeForecastCashFlow } = await import("../forecast-cash-flow.service");
    const { computePayableAging } = await import("../obligation-aging.service");
    try {
      const dueDate = new Date("2026-09-10T00:00:00.000Z");
      const now = new Date("2026-09-05T00:00:00.000Z");

      const partial = await createExpense({ organizationId: organization.id, title: "Kısmi ödenen", category: "OTHER", amount: 1000, currency: "TRY", expenseDate: new Date("2026-09-01T00:00:00.000Z") });
      await materializePayableSchedule({ organizationId: organization.id, expenseId: partial.id, dueDate, actorId: "test-actor" });
      await settleExpense({ organizationId: organization.id, expenseId: partial.id, amount: 400, paymentMethod: "CASH", financialAccountReference: account.id, occurredAt: now, actorId: "test-actor" });

      const cancelled = await createExpense({ organizationId: organization.id, title: "İptal edilen", category: "OTHER", amount: 500, currency: "TRY", expenseDate: new Date("2026-09-01T00:00:00.000Z") });
      await materializePayableSchedule({ organizationId: organization.id, expenseId: cancelled.id, dueDate, actorId: "test-actor" });
      await cancelExpense({ id: cancelled.id, organizationId: organization.id, reason: "iptal" });

      const reversed = await createExpense({ organizationId: organization.id, title: "Ters çevrilen ödeme", category: "OTHER", amount: 300, currency: "TRY", expenseDate: new Date("2026-09-01T00:00:00.000Z") });
      await materializePayableSchedule({ organizationId: organization.id, expenseId: reversed.id, dueDate, actorId: "test-actor" });
      const settlement = await settleExpense({ organizationId: organization.id, expenseId: reversed.id, amount: 300, paymentMethod: "CASH", financialAccountReference: account.id, occurredAt: now, actorId: "test-actor" });
      await reverseExpenseSettlement({ organizationId: organization.id, expenseSettlementId: settlement!.settlement.id, reason: "hata", actorId: "test-actor" });

      const forecast = await computeForecastCashFlow(organization.id, now, 30);
      const forecastItems = forecast.items.filter((item) => [partial.id, cancelled.id, reversed.id].some((id) => item.id.includes(id)) || item.title.includes("Kısmi") || item.title.includes("İptal") || item.title.includes("Ters"));
      const partialItem = forecastItems.find((i) => i.title === "Kısmi ödenen");
      const cancelledItem = forecastItems.find((i) => i.title === "İptal edilen");
      const reversedItem = forecastItems.find((i) => i.title === "Ters çevrilen ödeme");

      expect(partialItem?.amount).toBe(600); // 1000 - 400 remaining, not 1000
      expect(cancelledItem).toBeUndefined(); // cancelled never forecast
      expect(reversedItem?.amount).toBe(300); // reversal reopened the full amount

      const aging = await computePayableAging(organization.id, now);
      const agingPartial = aging.items.find((i) => i.title === "Kısmi ödenen");
      const agingReversed = aging.items.find((i) => i.title === "Ters çevrilen ödeme");
      expect(agingPartial?.amount).toBe(600);
      expect(agingPartial?.bucket).toBe("NOT_YET_DUE"); // dueDate 09-10 is after "now" 09-05
      expect(agingReversed?.amount).toBe(300);
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("INSTRUMENT ALLOCATION DOES NOT DOUBLE-COUNT THE UNDERLYING OBLIGATION: forecast counts the receivable once even while an unclearedcheque is allocated against it", async () => {
    const { prisma, organization } = await setup();
    const { createPayment } = await import("@/lib/core/payments/payment.repository");
    const { registerInstrument, applyInstrumentToObligation } = await import("@/lib/core/financial-instruments/financial-instrument.service");
    const { computeForecastCashFlow } = await import("../forecast-cash-flow.service");
    try {
      const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: "Test Müşteri" } });
      const dueDate = new Date("2026-09-15T00:00:00.000Z");
      const payment = await createPayment({ organizationId: organization.id, customerId: customer.id, personId: null, quoteId: null, invoiceId: null, title: "Test Fatura", amount: 800, currency: "TRY", dueDate });
      const line = await prisma.obligationScheduleLine.create({ data: { organizationId: organization.id, direction: "RECEIVABLE", sourceType: "INVOICE", sourceId: "manual-invoice-1", componentIndex: 0, allocationType: "REMAINDER", maturityBasis: "FIXED_DATE", dueDate, originalAmount: 800, currency: "TRY", paymentId: payment.id, actorId: "test-actor" } });

      const instrument = await registerInstrument({ organizationId: organization.id, instrumentType: "CHEQUE", direction: "RECEIVED", customerId: customer.id, amount: 800, currency: "TRY", maturityDate: dueDate, actorId: "test-actor" });
      await applyInstrumentToObligation({ organizationId: organization.id, instrumentId: instrument.id, obligationScheduleLineId: line.id, amount: 800, actorId: "test-actor" });

      const forecast = await computeForecastCashFlow(organization.id, new Date("2026-09-01T00:00:00.000Z"), 60);
      const receivableItem = forecast.items.find((item) => item.id === `obligation:${line.id}`);
      const instrumentItem = forecast.items.find((item) => item.id === `instrument:${instrument.id}`);
      // items[] keeps BOTH facts visible for drill-down: the raw commercial receivable (untouched by
      // allocation — Payment.paidAmount is never modified by applying an instrument) AND the instrument's
      // own face value, exactly as Calendar shows them.
      expect(receivableItem?.amount).toBe(800);
      expect(instrumentItem?.amount).toBe(800);
      const receivableTotal = forecast.totals.find((t) => t.direction === "RECEIVABLE" && t.currency === "TRY")!;
      // But the AGGREGATE total must not double-count: the obligation's contribution is netted down by
      // its own uncleared instrument coverage (800), leaving only the instrument's 800 — never 1600.
      expect(receivableTotal.amount).toBe(800);
    } finally {
      await prisma.instrumentAllocation.deleteMany({ where: { organizationId: organization.id } });
      await prisma.instrumentStatusHistory.deleteMany({ where: { organizationId: organization.id } });
      await prisma.financialInstrument.deleteMany({ where: { organizationId: organization.id } });
      await prisma.obligationScheduleLine.deleteMany({ where: { organizationId: organization.id } });
      await prisma.payment.deleteMany({ where: { organizationId: organization.id } });
      await prisma.customer.deleteMany({ where: { organizationId: organization.id } });
      await cleanup(prisma, organization.id);
    }
  });

  it("TIMEZONE MIDNIGHT AGING: an obligation due at the first instant of the local day is NOT_YET_DUE, not OVERDUE, in Europe/Istanbul", async () => {
    const { prisma, organization } = await setup();
    const { createExpense } = await import("@/lib/core/expenses/expense-repository");
    const { materializePayableSchedule } = await import("@/lib/core/obligations/obligation-schedule.service");
    const { computePayableAging } = await import("../obligation-aging.service");
    try {
      // dueDate = 2026-09-05T21:00:00Z = 2026-09-06T00:00 local (Europe/Istanbul, UTC+3) — the very first instant of the next local day.
      const dueDate = new Date("2026-09-05T21:00:00.000Z");
      const expense = await createExpense({ organizationId: organization.id, title: "Gece yarısı sınırı", category: "OTHER", amount: 100, currency: "TRY", expenseDate: new Date("2026-09-01T00:00:00.000Z") });
      await materializePayableSchedule({ organizationId: organization.id, expenseId: expense.id, dueDate, actorId: "test-actor" });

      // "now" = local Sept 5, 12:00 (still Sept 5 locally) — dueDate is local Sept 6, so NOT_YET_DUE.
      const now = new Date("2026-09-05T09:00:00.000Z");
      const aging = await computePayableAging(organization.id, now, "Europe/Istanbul");
      const item = aging.items.find((i) => i.title === "Gece yarısı sınırı");
      expect(item?.bucket).toBe("NOT_YET_DUE");

      // "now" = local Sept 6, 01:00 (just past local midnight) — dueDate is now today (Sept 6 local), so DUE_TODAY.
      const nowNextDay = new Date("2026-09-05T22:00:00.000Z");
      const agingNextDay = await computePayableAging(organization.id, nowNextDay, "Europe/Istanbul");
      const itemNextDay = agingNextDay.items.find((i) => i.title === "Gece yarısı sınırı");
      expect(itemNextDay?.bucket).toBe("DUE_TODAY");
    } finally {
      await cleanup(prisma, organization.id);
    }
  });
});
