import { describe, expect, it } from "vitest";

const databaseUrl = process.env.FINANCIAL_REMINDER_SCHEDULER_INTEGRATION_DATABASE_URL;

/**
 * Real-Postgres, env-var-gated (bkz. settlement-concurrency.integration.test.ts).
 * Kanıtlar: aynı gün tekrar eden scheduler çalıştırması spam üretmez,
 * eşzamanlı iki scheduler çalıştırması bile tek dispatch/notification
 * üretir, ertesi gün (dayBucket değiştiğinde) reminder gerçekten geri
 * gelir, ve organization isolation korunur.
 */
describe.skipIf(!databaseUrl)("Financial reminder scheduler against migrated PostgreSQL", () => {
  async function setup() {
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = await import("@/lib/core/shared/prisma");
    const organization = await prisma.organization.create({ data: { name: `Financial reminder scheduler integration ${Date.now()}-${Math.random()}` } });
    const user = await prisma.user.create({ data: { phone: `+90555${Math.floor(Math.random() * 1e7)}`, fullName: "Test Owner" } });
    const member = await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    return { prisma, organization, member };
  }

  async function cleanup(prisma: Awaited<ReturnType<typeof setup>>["prisma"], organizationId: string) {
    await prisma.notification.deleteMany({ where: { organizationId } });
    await prisma.financialReminderDispatch.deleteMany({ where: { organizationId } });
    await prisma.financialAccountMovement.deleteMany({ where: { organizationId } });
    await prisma.expenseSettlement.deleteMany({ where: { organizationId } });
    await prisma.obligationScheduleLine.deleteMany({ where: { organizationId } });
    await prisma.expense.deleteMany({ where: { organizationId } });
    await prisma.ledgerEntry.deleteMany({ where: { organizationId } });
    await prisma.financialAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  }

  async function createOverdueExpense(organizationId: string) {
    const { createExpense } = await import("@/lib/core/expenses/expense-repository");
    const { materializePayableSchedule } = await import("@/lib/core/obligations/obligation-schedule.service");
    const expense = await createExpense({ organizationId, title: "Vadesi geçmiş gider", category: "OTHER", amount: 250, currency: "TRY", expenseDate: new Date("2026-09-01T00:00:00.000Z") });
    const line = await materializePayableSchedule({ organizationId, expenseId: expense.id, dueDate: new Date("2026-09-01T00:00:00.000Z"), actorId: "test-actor" });
    return { expense, line: line.line };
  }

  it("NO SPAM: two scheduler runs the same day send exactly one notification and record exactly one dispatch row", async () => {
    const { prisma, organization } = await setup();
    const { runFinancialReminderScan } = await import("../financial-reminder-scheduler.service");
    try {
      await createOverdueExpense(organization.id);
      const now = new Date("2026-09-05T09:00:00.000Z");

      // runFinancialReminderScan scans every organization in the (shared, local) database —
      // filter every assertion down to this test's own organizationId so pre-existing/parallel
      // data elsewhere in the dev DB can never affect this test's outcome.
      const first = (await runFinancialReminderScan(now)).filter((result) => result.organizationId === organization.id);
      const second = (await runFinancialReminderScan(new Date("2026-09-05T15:00:00.000Z"))).filter((result) => result.organizationId === organization.id); // same local day, later that day

      expect(first).toHaveLength(1);
      expect(second).toHaveLength(0); // already dispatched today — no-op, not a duplicate

      const dispatches = await prisma.financialReminderDispatch.findMany({ where: { organizationId: organization.id } });
      expect(dispatches).toHaveLength(1);
      const notifications = await prisma.notification.findMany({ where: { organizationId: organization.id, type: "financial_reminder.overdue" } });
      expect(notifications).toHaveLength(1);
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("CONCURRENT SCHEDULER EXECUTION: two truly concurrent scans for the same day still produce exactly one dispatch row", async () => {
    const { prisma, organization } = await setup();
    const { runFinancialReminderScan } = await import("../financial-reminder-scheduler.service");
    try {
      await createOverdueExpense(organization.id);
      const now = new Date("2026-09-05T09:00:00.000Z");

      await Promise.all([runFinancialReminderScan(now), runFinancialReminderScan(now)]);

      const dispatches = await prisma.financialReminderDispatch.findMany({ where: { organizationId: organization.id } });
      expect(dispatches).toHaveLength(1);
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("SETTLED SOURCE PRODUCES NO NOTIFICATION: fully paying the expense before the scheduler runs means no overdue reminder ever fires", async () => {
    const { prisma, organization, member } = await setup();
    const { settleExpense } = await import("@/lib/core/expenses/expense-settlement.service");
    const { runFinancialReminderScan } = await import("../financial-reminder-scheduler.service");
    try {
      void member;
      const account = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "CASH", name: "Ana Kasa", normalizedName: "ana kasa", currency: "TRY" } });
      const { expense } = await createOverdueExpense(organization.id);
      await settleExpense({ organizationId: organization.id, expenseId: expense.id, amount: 250, paymentMethod: "CASH", financialAccountReference: account.id, actorId: "test-actor" });

      const results = (await runFinancialReminderScan(new Date("2026-09-05T09:00:00.000Z"))).filter((result) => result.organizationId === organization.id);
      expect(results).toHaveLength(0);
      const notifications = await prisma.notification.findMany({ where: { organizationId: organization.id } });
      expect(notifications).toHaveLength(0);
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("REVERSAL REOPENS THE REMINDER: paying then reversing the payment brings the overdue reminder back on the next day's scan", async () => {
    const { prisma, organization } = await setup();
    const { settleExpense, reverseExpenseSettlement } = await import("@/lib/core/expenses/expense-settlement.service");
    const { runFinancialReminderScan } = await import("../financial-reminder-scheduler.service");
    try {
      const account = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "CASH", name: "Ana Kasa", normalizedName: "ana kasa", currency: "TRY" } });
      const { expense } = await createOverdueExpense(organization.id);

      const day1 = new Date("2026-09-05T09:00:00.000Z");
      const firstScanBeforePayment = (await runFinancialReminderScan(day1)).filter((result) => result.organizationId === organization.id);
      expect(firstScanBeforePayment).toHaveLength(1); // still unpaid, overdue reminder fires day 1

      const settlement = await settleExpense({ organizationId: organization.id, expenseId: expense.id, amount: 250, paymentMethod: "CASH", financialAccountReference: account.id, actorId: "test-actor" });
      await reverseExpenseSettlement({ organizationId: organization.id, expenseSettlementId: settlement!.settlement.id, reason: "yanlış ödeme", actorId: "test-actor" });

      // Same day again — already dispatched today, reversal doesn't re-fire same-day (no spam).
      const sameDayAfterReversal = (await runFinancialReminderScan(new Date("2026-09-05T18:00:00.000Z"))).filter((result) => result.organizationId === organization.id);
      expect(sameDayAfterReversal).toHaveLength(0);

      // Next day — dayBucket changes, obligation is (again) outstanding, reminder returns.
      const day2 = new Date("2026-09-06T09:00:00.000Z");
      const secondDayScan = (await runFinancialReminderScan(day2)).filter((result) => result.organizationId === organization.id);
      expect(secondDayScan).toHaveLength(1);

      const dispatches = await prisma.financialReminderDispatch.findMany({ where: { organizationId: organization.id }, orderBy: { dayBucket: "asc" } });
      expect(dispatches.map((dispatch) => dispatch.dayBucket)).toEqual(["2026-09-05", "2026-09-06"]);
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("ORGANIZATION ISOLATION: a scan only ever dispatches for its own organization's obligations", async () => {
    const { prisma, organization: orgA } = await setup();
    const userB = await prisma.user.create({ data: { phone: `+90555${Math.floor(Math.random() * 1e7)}`, fullName: "Test Owner B" } });
    const orgB = await prisma.organization.create({ data: { name: `Financial reminder scheduler isolation B ${Date.now()}-${Math.random()}` } });
    await prisma.organizationMember.create({ data: { organizationId: orgB.id, userId: userB.id, role: "OWNER" } });
    const { runFinancialReminderScan } = await import("../financial-reminder-scheduler.service");
    try {
      await createOverdueExpense(orgA.id);
      // orgB has no obligations at all.
      await runFinancialReminderScan(new Date("2026-09-05T09:00:00.000Z"));

      const dispatchesA = await prisma.financialReminderDispatch.findMany({ where: { organizationId: orgA.id } });
      const dispatchesB = await prisma.financialReminderDispatch.findMany({ where: { organizationId: orgB.id } });
      expect(dispatchesA).toHaveLength(1);
      expect(dispatchesB).toHaveLength(0);
    } finally {
      await prisma.organizationMember.deleteMany({ where: { organizationId: orgB.id } });
      await prisma.organization.delete({ where: { id: orgB.id } });
      await cleanup(prisma, orgA.id);
    }
  });
});
