import { describe, expect, it } from "vitest";

const databaseUrl = process.env.CORPORATE_CARD_INTEGRATION_DATABASE_URL;

/**
 * settlement-concurrency.integration.test.ts ile aynı gerçek-Postgres,
 * env-var-gated desen. Phase 11'in en kritik invariant'ını gerçek migrated
 * schema + gerçek transaction'lar altında kanıtlar: bir kart harcaması
 * ekonomik olarak bir kez tanınır (Expense) ve gerçek nakit yalnız bir kez
 * çıkar (CardStatementPayment → FinancialAccountMovement) — asla iki kez.
 */
describe.skipIf(!databaseUrl)("Corporate card statement lifecycle against migrated PostgreSQL", () => {
  async function setup() {
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = await import("@/lib/core/shared/prisma");
    const organization = await prisma.organization.create({ data: { name: `Corporate card integration ${Date.now()}-${Math.random()}` } });
    const account = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "BANK", name: "Ana Banka", normalizedName: "ana banka", currency: "TRY" } });
    const user = await prisma.user.create({ data: { phone: `+90555${Math.floor(Math.random() * 1e7)}`, fullName: "Test User" } });
    const member = await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    return { prisma, organization, account, member };
  }

  it("EXPENSE ONCE, CASH OUT ONCE: a card expense is recognized once and the statement payment is the sole cash outflow", async () => {
    const { prisma, organization, account, member } = await setup();
    const { createExpense } = await import("@/lib/core/expenses/expense-repository");
    const { createNewCorporateCard, openCardStatement, closeCardStatement, payCardStatement } = await import("../corporate-card.service");

    try {
      const card = await createNewCorporateCard({ organizationId: organization.id, cardholderMemberId: member.id, label: "Ops Visa", currency: "TRY", actorId: "test-actor" });

      const expenseDate = new Date("2026-09-01T10:00:00.000Z");
      await createExpense({ organizationId: organization.id, title: "Müşteri yemeği", category: "OTHER", amount: 500, currency: "TRY", expenseDate, corporateCardId: card.id, createdByUserId: member.userId });

      const statement = await openCardStatement({ organizationId: organization.id, corporateCardId: card.id, periodStart: new Date("2026-09-01T00:00:00.000Z"), periodEnd: new Date("2026-09-30T23:59:59.000Z"), dueDate: new Date("2026-10-10T00:00:00.000Z"), actorId: "test-actor" });

      const closeOutcome = await closeCardStatement({ organizationId: organization.id, cardStatementId: statement.id, actorId: "test-actor" });
      expect(closeOutcome.assignedExpenseCount).toBe(1);
      expect(Number(closeOutcome.cardStatement.totalAmount)).toBe(500);

      // A CARD_STATEMENT obligation must now exist — the canonical "what do we owe" query works for cards too.
      const obligationLine = await prisma.obligationScheduleLine.findFirst({ where: { organizationId: organization.id, sourceType: "CARD_STATEMENT", cardStatementId: statement.id } });
      expect(obligationLine).not.toBeNull();
      expect(Number(obligationLine!.originalAmount)).toBe(500);

      const payOutcome = await payCardStatement({ organizationId: organization.id, cardStatementId: statement.id, amount: 500, paymentMethod: "BANK_TRANSFER", financialAccountReference: account.id, actorId: "test-actor" });
      expect(payOutcome?.cardStatement.status).toBe("PAID");

      // Exactly one real cash movement for this whole card cycle.
      const movements = await prisma.financialAccountMovement.findMany({ where: { organizationId: organization.id, financialAccountId: account.id } });
      expect(movements).toHaveLength(1);
      expect(Number(movements[0]!.amount)).toBe(500);
      expect(movements[0]!.direction).toBe("OUT");

      // The underlying Expense itself was never independently settled — no ExpenseSettlement exists for it.
      const expense = await prisma.expense.findFirstOrThrow({ where: { organizationId: organization.id, corporateCardId: card.id } });
      expect(Number(expense.paidAmount)).toBe(0);
      const directSettlements = await prisma.expenseSettlement.findMany({ where: { organizationId: organization.id, expenseId: expense.id } });
      expect(directSettlements).toHaveLength(0);
    } finally {
      await prisma.expenseSettlement.deleteMany({ where: { organizationId: organization.id } });
      await prisma.financialAccountMovement.deleteMany({ where: { organizationId: organization.id } });
      await prisma.cardStatementPayment.deleteMany({ where: { organizationId: organization.id } });
      await prisma.obligationScheduleLine.deleteMany({ where: { organizationId: organization.id } });
      await prisma.expense.deleteMany({ where: { organizationId: organization.id } });
      await prisma.cardStatement.deleteMany({ where: { organizationId: organization.id } });
      await prisma.corporateCard.deleteMany({ where: { organizationId: organization.id } });
      await prisma.ledgerEntry.deleteMany({ where: { organizationId: organization.id } });
      await prisma.financialAccount.deleteMany({ where: { organizationId: organization.id } });
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.$disconnect();
    }
  });

  it("BYPASS BLOCKED: a corporate-card expense cannot be settled directly via expense.settle nor materialized as its own payable", async () => {
    const { prisma, organization, account, member } = await setup();
    const { createExpense } = await import("@/lib/core/expenses/expense-repository");
    const { settleExpense } = await import("@/lib/core/expenses/expense-settlement.service");
    const { materializePayableSchedule } = await import("@/lib/core/obligations/obligation-schedule.service");
    const { createNewCorporateCard } = await import("../corporate-card.service");

    try {
      const card = await createNewCorporateCard({ organizationId: organization.id, cardholderMemberId: member.id, label: "Ops Visa", currency: "TRY", actorId: "test-actor" });
      const expense = await createExpense({ organizationId: organization.id, title: "Kart harcaması", category: "OTHER", amount: 200, currency: "TRY", expenseDate: new Date(), corporateCardId: card.id, createdByUserId: member.userId });

      await expect(settleExpense({ organizationId: organization.id, expenseId: expense.id, amount: 200, paymentMethod: "CASH", financialAccountReference: account.id, actorId: "test-actor" })).rejects.toMatchObject({ status: 409 });

      await expect(materializePayableSchedule({ organizationId: organization.id, expenseId: expense.id, dueDate: new Date(), actorId: "test-actor" })).rejects.toMatchObject({ status: 409 });
    } finally {
      await prisma.expenseSettlement.deleteMany({ where: { organizationId: organization.id } });
      await prisma.obligationScheduleLine.deleteMany({ where: { organizationId: organization.id } });
      await prisma.expense.deleteMany({ where: { organizationId: organization.id } });
      await prisma.corporateCard.deleteMany({ where: { organizationId: organization.id } });
      await prisma.ledgerEntry.deleteMany({ where: { organizationId: organization.id } });
      await prisma.financialAccount.deleteMany({ where: { organizationId: organization.id } });
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.$disconnect();
    }
  });

  it("CONCURRENT IDEMPOTENCY: two truly concurrent card statement payments with the same idempotencyKey commit exactly one payment", async () => {
    const { prisma, organization, account, member } = await setup();
    const { createExpense } = await import("@/lib/core/expenses/expense-repository");
    const { createNewCorporateCard, openCardStatement, closeCardStatement, payCardStatement } = await import("../corporate-card.service");

    try {
      const card = await createNewCorporateCard({ organizationId: organization.id, cardholderMemberId: member.id, label: "Ops Visa", currency: "TRY", actorId: "test-actor" });
      await createExpense({ organizationId: organization.id, title: "Kart harcaması", category: "OTHER", amount: 1000, currency: "TRY", expenseDate: new Date("2026-09-05T00:00:00.000Z"), corporateCardId: card.id, createdByUserId: member.userId });
      const statement = await openCardStatement({ organizationId: organization.id, corporateCardId: card.id, periodStart: new Date("2026-09-01T00:00:00.000Z"), periodEnd: new Date("2026-09-30T23:59:59.000Z"), dueDate: new Date("2026-10-10T00:00:00.000Z"), actorId: "test-actor" });
      await closeCardStatement({ organizationId: organization.id, cardStatementId: statement.id, actorId: "test-actor" });

      const attempt = () => payCardStatement({ organizationId: organization.id, cardStatementId: statement.id, amount: 300, paymentMethod: "BANK_TRANSFER", financialAccountReference: account.id, idempotencyKey: "retry-key-1", actorId: "test-actor" });
      const [a, b] = await Promise.all([attempt(), attempt()]);

      expect(a?.payment.id).toBe(b?.payment.id);
      expect([a?.replayed, b?.replayed].sort()).toEqual([false, true]);
      const payments = await prisma.cardStatementPayment.findMany({ where: { organizationId: organization.id, cardStatementId: statement.id, idempotencyKey: "retry-key-1" } });
      expect(payments).toHaveLength(1);
    } finally {
      await prisma.financialAccountMovement.deleteMany({ where: { organizationId: organization.id } });
      await prisma.cardStatementPayment.deleteMany({ where: { organizationId: organization.id } });
      await prisma.obligationScheduleLine.deleteMany({ where: { organizationId: organization.id } });
      await prisma.expense.deleteMany({ where: { organizationId: organization.id } });
      await prisma.cardStatement.deleteMany({ where: { organizationId: organization.id } });
      await prisma.corporateCard.deleteMany({ where: { organizationId: organization.id } });
      await prisma.ledgerEntry.deleteMany({ where: { organizationId: organization.id } });
      await prisma.financialAccount.deleteMany({ where: { organizationId: organization.id } });
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.$disconnect();
    }
  });
});
