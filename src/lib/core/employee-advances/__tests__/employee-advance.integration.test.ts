import { describe, expect, it } from "vitest";

const databaseUrl = process.env.EMPLOYEE_ADVANCE_INTEGRATION_DATABASE_URL;

/**
 * Aynı gerçek-Postgres, env-var-gated desen (bkz.
 * settlement-concurrency.integration.test.ts). "employee advance ≠ expense"
 * ve "aynı tutar hem advance hem expense olarak double-count edilmemeli"
 * invariant'larını gerçek migrated schema altında kanıtlar.
 */
describe.skipIf(!databaseUrl)("Employee advance lifecycle against migrated PostgreSQL", () => {
  async function setup() {
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = await import("@/lib/core/shared/prisma");
    const organization = await prisma.organization.create({ data: { name: `Employee advance integration ${Date.now()}-${Math.random()}` } });
    const account = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "CASH", name: "Ana Kasa", normalizedName: "ana kasa", currency: "TRY" } });
    const user = await prisma.user.create({ data: { phone: `+90555${Math.floor(Math.random() * 1e7)}`, fullName: "Test Employee" } });
    const member = await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "EMPLOYEE" } });
    return { prisma, organization, account, member };
  }

  async function cleanup(prisma: Awaited<ReturnType<typeof setup>>["prisma"], organizationId: string) {
    await prisma.financialAccountMovement.deleteMany({ where: { organizationId } });
    await prisma.employeeAdvanceReconciliation.deleteMany({ where: { organizationId } });
    await prisma.employeeAdvanceMovement.deleteMany({ where: { organizationId } });
    await prisma.expenseSettlement.deleteMany({ where: { organizationId } });
    await prisma.expense.deleteMany({ where: { organizationId } });
    await prisma.employeeAdvance.deleteMany({ where: { organizationId } });
    await prisma.ledgerEntry.deleteMany({ where: { organizationId } });
    await prisma.financialAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  }

  it("ADVANCE ≠ EXPENSE: disbursing an advance never creates an Expense row", async () => {
    const { prisma, organization, account, member } = await setup();
    const { createNewEmployeeAdvance, moveEmployeeAdvance } = await import("../employee-advance.service");
    try {
      const advance = await createNewEmployeeAdvance({ organizationId: organization.id, employeeMemberId: member.id, amount: 1000, currency: "TRY", actorId: "test-actor" });
      const outcome = await moveEmployeeAdvance({ organizationId: organization.id, employeeAdvanceId: advance.id, direction: "OUT", amount: 1000, paymentMethod: "CASH", financialAccountReference: account.id, actorId: "test-actor" });

      expect(outcome?.employeeAdvance.status).toBe("OUTSTANDING");
      const expenses = await prisma.expense.findMany({ where: { organizationId: organization.id } });
      expect(expenses).toHaveLength(0);

      const movements = await prisma.financialAccountMovement.findMany({ where: { organizationId: organization.id } });
      expect(movements).toHaveLength(1);
      expect(movements[0]!.direction).toBe("OUT");
      expect(Number(movements[0]!.amount)).toBe(1000);
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("NO DOUBLE-COUNT: an expense partially reconciled against an advance cannot also be cash-settled beyond its remaining balance", async () => {
    const { prisma, organization, account, member } = await setup();
    const { createExpense } = await import("@/lib/core/expenses/expense-repository");
    const { settleExpense } = await import("@/lib/core/expenses/expense-settlement.service");
    const { createNewEmployeeAdvance, moveEmployeeAdvance, reconcileEmployeeAdvance } = await import("../employee-advance.service");
    try {
      const advance = await createNewEmployeeAdvance({ organizationId: organization.id, employeeMemberId: member.id, amount: 1000, currency: "TRY", actorId: "test-actor" });
      await moveEmployeeAdvance({ organizationId: organization.id, employeeAdvanceId: advance.id, direction: "OUT", amount: 1000, paymentMethod: "CASH", financialAccountReference: account.id, actorId: "test-actor" });

      const expense = await createExpense({ organizationId: organization.id, title: "Saha ekipmanı", category: "OTHER", amount: 600, currency: "TRY", expenseDate: new Date(), employeeMemberId: member.id, createdByUserId: member.userId });

      // Reconcile 400 of it against the advance — no cash moves.
      const reconcileOutcome = await reconcileEmployeeAdvance({ organizationId: organization.id, employeeAdvanceId: advance.id, expenseId: expense.id, amount: 400, actorId: "test-actor" });
      expect(reconcileOutcome?.employeeAdvance.status).toBe("PARTIALLY_RECONCILED");

      // Real cash settlement can only cover the remaining 200 — not 600 again.
      await expect(
        settleExpense({ organizationId: organization.id, expenseId: expense.id, amount: 600, paymentMethod: "CASH", financialAccountReference: account.id, actorId: "test-actor" }),
      ).rejects.toMatchObject({ status: 409 });

      const cashOutcome = await settleExpense({ organizationId: organization.id, expenseId: expense.id, amount: 200, paymentMethod: "CASH", financialAccountReference: account.id, actorId: "test-actor" });
      expect(cashOutcome?.expense.status).toBe("PAID");

      // Total money that ever left the company for this expense: 400 via advance disbursement (shared across other reconciliations too) is not double-attributed — only the direct settlement's own movement is 200.
      const directMovement = await prisma.financialAccountMovement.findFirst({ where: { organizationId: organization.id, expenseSettlementId: { not: null } } });
      expect(Number(directMovement!.amount)).toBe(200);
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("RETURN: an employee returning unused advance reduces the outstanding balance via a real IN movement", async () => {
    const { prisma, organization, account, member } = await setup();
    const { createNewEmployeeAdvance, moveEmployeeAdvance } = await import("../employee-advance.service");
    try {
      const advance = await createNewEmployeeAdvance({ organizationId: organization.id, employeeMemberId: member.id, amount: 500, currency: "TRY", actorId: "test-actor" });
      await moveEmployeeAdvance({ organizationId: organization.id, employeeAdvanceId: advance.id, direction: "OUT", amount: 500, paymentMethod: "CASH", financialAccountReference: account.id, actorId: "test-actor" });
      const returnOutcome = await moveEmployeeAdvance({ organizationId: organization.id, employeeAdvanceId: advance.id, direction: "IN", amount: 500, paymentMethod: "CASH", financialAccountReference: account.id, actorId: "test-actor" });

      expect(returnOutcome?.employeeAdvance.status).toBe("OUTSTANDING");
      // Attempting to return more than what's outstanding must fail.
      await expect(
        moveEmployeeAdvance({ organizationId: organization.id, employeeAdvanceId: advance.id, direction: "IN", amount: 1, paymentMethod: "CASH", financialAccountReference: account.id, actorId: "test-actor" }),
      ).rejects.toMatchObject({ status: 409 });
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("CONCURRENT IDEMPOTENCY: two truly concurrent disbursement requests with the same idempotencyKey commit exactly one movement", async () => {
    const { prisma, organization, account, member } = await setup();
    const { createNewEmployeeAdvance, moveEmployeeAdvance } = await import("../employee-advance.service");
    try {
      const advance = await createNewEmployeeAdvance({ organizationId: organization.id, employeeMemberId: member.id, amount: 500, currency: "TRY", actorId: "test-actor" });
      const attempt = () => moveEmployeeAdvance({ organizationId: organization.id, employeeAdvanceId: advance.id, direction: "OUT", amount: 300, paymentMethod: "CASH", financialAccountReference: account.id, idempotencyKey: "retry-key-1", actorId: "test-actor" });
      const [a, b] = await Promise.all([attempt(), attempt()]);

      expect(a?.movement.id).toBe(b?.movement.id);
      expect([a?.replayed, b?.replayed].sort()).toEqual([false, true]);
      const movements = await prisma.employeeAdvanceMovement.findMany({ where: { organizationId: organization.id, employeeAdvanceId: advance.id, idempotencyKey: "retry-key-1" } });
      expect(movements).toHaveLength(1);
    } finally {
      await cleanup(prisma, organization.id);
    }
  });
});
