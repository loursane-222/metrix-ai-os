import { describe, expect, it } from "vitest";

const databaseUrl = process.env.FINANCIAL_REPORTING_CASH_INTEGRATION_DATABASE_URL;

/**
 * Real-Postgres, env-var-gated (bkz. settlement-concurrency.integration.test.ts).
 * Kanıtlar: actual cash position/cash flow yalnız FinancialAccountMovement'tan
 * türer (multi-account, CASH/BANK, multi-currency), actual-vs-forecast aynı
 * ekonomik tutarı iki kez saymaz, ve Ledger ile FinancialAccountMovement
 * bağımsız iki cash source olarak toplanmaz.
 */
describe.skipIf(!databaseUrl)("Actual cash position/flow/actual-vs-forecast against migrated PostgreSQL", () => {
  async function setup() {
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = await import("@/lib/core/shared/prisma");
    const organization = await prisma.organization.create({ data: { name: `Financial reporting cash integration ${Date.now()}-${Math.random()}` } });
    return { prisma, organization };
  }

  async function cleanup(prisma: Awaited<ReturnType<typeof setup>>["prisma"], organizationId: string) {
    await prisma.financialAccountMovement.deleteMany({ where: { organizationId } });
    await prisma.expenseSettlement.deleteMany({ where: { organizationId } });
    await prisma.obligationScheduleLine.deleteMany({ where: { organizationId } });
    await prisma.expense.deleteMany({ where: { organizationId } });
    await prisma.ledgerEntryLine.deleteMany({ where: { ledgerEntry: { organizationId } } });
    await prisma.ledgerEntry.deleteMany({ where: { organizationId } });
    await prisma.financialAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  }

  it("MULTI-ACCOUNT / CASH-BANK / MULTI-CURRENCY: position and flow never blend accounts or currencies", async () => {
    const { prisma, organization } = await setup();
    const { createExpense } = await import("@/lib/core/expenses/expense-repository");
    const { settleExpense } = await import("@/lib/core/expenses/expense-settlement.service");
    const { computeActualCashPosition } = await import("../cash-position.service");
    const { computeActualCashFlow } = await import("../cash-flow.service");
    try {
      const cashTry = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "CASH", name: "Kasa TRY", normalizedName: "kasa try", currency: "TRY" } });
      const bankEur = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "BANK", name: "Banka EUR", normalizedName: "banka eur", currency: "EUR" } });

      const expenseTry = await createExpense({ organizationId: organization.id, title: "TRY gider", category: "OTHER", amount: 300, currency: "TRY", expenseDate: new Date("2026-09-01T00:00:00.000Z") });
      const expenseEur = await createExpense({ organizationId: organization.id, title: "EUR gider", category: "OTHER", amount: 50, currency: "EUR", expenseDate: new Date("2026-09-01T00:00:00.000Z") });

      const periodStart = new Date("2026-09-01T00:00:00.000Z");
      const occurredAt = new Date("2026-09-05T00:00:00.000Z");
      await settleExpense({ organizationId: organization.id, expenseId: expenseTry.id, amount: 300, paymentMethod: "CASH", financialAccountReference: cashTry.id, occurredAt, actorId: "test-actor" });
      await settleExpense({ organizationId: organization.id, expenseId: expenseEur.id, amount: 50, paymentMethod: "BANK_TRANSFER", financialAccountReference: bankEur.id, occurredAt, actorId: "test-actor" });

      const position = await computeActualCashPosition(organization.id, new Date("2026-09-10T00:00:00.000Z"));
      const cashTryEntry = position.accounts.find((a) => a.financialAccountId === cashTry.id)!;
      const bankEurEntry = position.accounts.find((a) => a.financialAccountId === bankEur.id)!;
      expect(cashTryEntry.type).toBe("CASH");
      expect(cashTryEntry.balance).toBe(-300); // cash OUT for the settlement
      expect(bankEurEntry.type).toBe("BANK");
      expect(bankEurEntry.balance).toBe(-50);
      // Currencies are never blended into one total.
      expect(position.totalsByCurrency).toEqual(expect.arrayContaining([{ currency: "TRY", amount: -300 }, { currency: "EUR", amount: -50 }]));
      expect(position.totalsByCurrency.find((t) => t.currency === "TRY")!.amount).not.toBe(position.totalsByCurrency.find((t) => t.currency === "EUR")!.amount + 1000); // sanity: no fabricated FX blend

      const flow = await computeActualCashFlow(organization.id, periodStart, new Date("2026-09-30T23:59:59.000Z"));
      const tryAccountFlow = flow.byAccount.find((a) => a.financialAccountId === cashTry.id)!;
      expect(tryAccountFlow.outflow).toBe(300);
      const category = flow.byCategory.find((c) => c.category === "expense_settlement" && c.currency === "TRY");
      expect(category?.amount).toBe(300);
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("LEDGER + FINANCIALACCOUNTMOVEMENT ARE NOT TWO INDEPENDENT CASH SOURCES: actual cash flow totals equal FinancialAccountMovement alone, unaffected by however many LedgerEntry rows the same event produced", async () => {
    const { prisma, organization } = await setup();
    const { createExpense } = await import("@/lib/core/expenses/expense-repository");
    const { settleExpense } = await import("@/lib/core/expenses/expense-settlement.service");
    const { computeActualCashFlow } = await import("../cash-flow.service");
    try {
      const account = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "CASH", name: "Ana Kasa", normalizedName: "ana kasa", currency: "TRY" } });
      const expense = await createExpense({ organizationId: organization.id, title: "Gider", category: "OTHER", amount: 500, currency: "TRY", expenseDate: new Date("2026-09-01T00:00:00.000Z") });
      const occurredAt = new Date("2026-09-05T00:00:00.000Z");
      await settleExpense({ organizationId: organization.id, expenseId: expense.id, amount: 500, paymentMethod: "CASH", financialAccountReference: account.id, occurredAt, actorId: "test-actor" });

      // This single settlement produces TWO LedgerEntry rows (creation + settlement) but exactly ONE FinancialAccountMovement.
      const ledgerEntries = await prisma.ledgerEntry.count({ where: { organizationId: organization.id } });
      const movements = await prisma.financialAccountMovement.count({ where: { organizationId: organization.id } });
      expect(ledgerEntries).toBeGreaterThanOrEqual(2);
      expect(movements).toBe(1);

      const flow = await computeActualCashFlow(organization.id, new Date("2026-09-01T00:00:00.000Z"), new Date("2026-09-30T23:59:59.000Z"));
      expect(flow.netByCurrency).toEqual([{ currency: "TRY", amount: -500 }]); // not -1000 (which double-counting Ledger+Movement would produce)
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("ACTUAL VS FORECAST: a settled obligation is never counted in both halves", async () => {
    const { prisma, organization } = await setup();
    const { createExpense } = await import("@/lib/core/expenses/expense-repository");
    const { materializePayableSchedule } = await import("@/lib/core/obligations/obligation-schedule.service");
    const { settleExpense } = await import("@/lib/core/expenses/expense-settlement.service");
    const { computeActualVsForecast } = await import("../cash-flow.service");
    try {
      const account = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "CASH", name: "Ana Kasa", normalizedName: "ana kasa", currency: "TRY" } });
      const expense = await createExpense({ organizationId: organization.id, title: "Kısmen ödenen gider", category: "OTHER", amount: 1000, currency: "TRY", expenseDate: new Date("2026-09-01T00:00:00.000Z") });
      await materializePayableSchedule({ organizationId: organization.id, expenseId: expense.id, dueDate: new Date("2026-09-15T00:00:00.000Z"), actorId: "test-actor" });
      const asOf = new Date("2026-09-05T00:00:00.000Z");
      await settleExpense({ organizationId: organization.id, expenseId: expense.id, amount: 400, paymentMethod: "CASH", financialAccountReference: account.id, occurredAt: asOf, actorId: "test-actor" });

      const comparison = await computeActualVsForecast(organization.id, asOf, 30);
      const actualTry = comparison.actualToDate.find((a) => a.currency === "TRY")!;
      const forecastTry = comparison.forecastRemaining.find((a) => a.currency === "TRY")!;
      expect(actualTry.outflow).toBe(400); // the 400 that already moved
      expect(forecastTry.outflow).toBe(600); // only the 600 still remaining — never 1000 (double count) and never 400 again
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("ORGANIZATION ISOLATION: cash position/flow never leak across organizations", async () => {
    const { prisma, organization: orgA } = await setup();
    const orgB = await prisma.organization.create({ data: { name: `Financial reporting cash isolation B ${Date.now()}-${Math.random()}` } });
    const { computeActualCashPosition } = await import("../cash-position.service");
    try {
      const accountA = await prisma.financialAccount.create({ data: { organizationId: orgA.id, type: "CASH", name: "A Kasa", normalizedName: "a kasa", currency: "TRY" } });
      await prisma.financialAccount.create({ data: { organizationId: orgB.id, type: "CASH", name: "B Kasa", normalizedName: "b kasa", currency: "TRY" } });

      const positionA = await computeActualCashPosition(orgA.id);
      const positionB = await computeActualCashPosition(orgB.id);
      expect(positionA.accounts.map((a) => a.financialAccountId)).toEqual([accountA.id]);
      expect(positionB.accounts.map((a) => a.financialAccountId)).not.toContain(accountA.id);
    } finally {
      await prisma.financialAccount.deleteMany({ where: { organizationId: orgB.id } });
      await prisma.organization.delete({ where: { id: orgB.id } });
      await cleanup(prisma, orgA.id);
    }
  });
});
