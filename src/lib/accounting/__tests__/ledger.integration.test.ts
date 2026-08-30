import { describe, expect, it } from "vitest";

const databaseUrl = process.env.LEDGER_INTEGRATION_DATABASE_URL;

describe.skipIf(!databaseUrl)("ledger integration against migrated PostgreSQL", () => {
  it("commits the live Invoice, Expense and Payment events with balanced entries", async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [{ prisma }, { sendInvoice }, { applyPaymentAmount }, { createExpense, cancelExpense }, { settleExpense }] = await Promise.all([
      import("@/lib/core/shared/prisma"),
      import("@/lib/core/invoices/invoice.service"),
      import("@/lib/core/payments/payment.service"),
      import("@/lib/core/expenses/expense-repository"),
      import("@/lib/core/expenses/expense-settlement.service"),
    ]);
    const organization = await prisma.organization.create({ data: { name: "Ledger validation" } });
    const invoice = await prisma.invoice.create({ data: { organizationId: organization.id, invoiceNumber: `VALIDATION-${Date.now()}`, title: "Ledger validation invoice", amount: 1000, taxRate: 20, taxAmount: 200, totalAmount: 1200, currency: "TRY" } });

    await sendInvoice({ organizationId: organization.id, invoiceId: invoice.id });

    const entry = await prisma.ledgerEntry.findFirstOrThrow({ where: { organizationId: organization.id, sourceType: "INVOICE", sourceId: invoice.id }, include: { lines: { include: { account: true } } } });
    const debit = entry.lines.reduce((sum, line) => sum + line.debitCents, BigInt(0));
    const credit = entry.lines.reduce((sum, line) => sum + line.creditCents, BigInt(0));
    expect(entry.lines.map((line) => line.account.code).sort()).toEqual(["120", "391", "600"]);
    expect({ debit, credit, lineCount: entry.lines.length }).toEqual({ debit: BigInt(120000), credit: BigInt(120000), lineCount: 3 });

    const financialAccount = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "CASH", name: "Ana Kasa", normalizedName: "ana kasa", currency: "TRY" } });
    const payment = await prisma.payment.create({ data: { organizationId: organization.id, title: "Ledger validation payment", amount: 500, currency: "TRY" } });
    const settlementOutcome = await applyPaymentAmount({ organizationId: organization.id, paymentId: payment.id, amount: 500, paymentMethod: "CASH", financialAccountReference: financialAccount.id, actorId: "test-actor" });
    const paymentEntry = await prisma.ledgerEntry.findFirstOrThrow({ where: { organizationId: organization.id, sourceType: "PAYMENT_APPLICATION", sourceId: settlementOutcome?.applicationId }, include: { lines: true } });
    expect(balance(paymentEntry.lines)).toEqual({ debit: BigInt(50000), credit: BigInt(50000) });

    const expense = await createExpense({ organizationId: organization.id, title: "Ledger validation expense", category: "OTHER", amount: 300, currency: "TRY", expenseDate: new Date("2026-08-06T09:00:00Z") });
    const recognitionEntry = await prisma.ledgerEntry.findFirstOrThrow({ where: { organizationId: organization.id, sourceType: "EXPENSE", sourceId: expense.id }, include: { lines: true } });
    expect(balance(recognitionEntry.lines)).toEqual({ debit: BigInt(30000), credit: BigInt(30000) });

    const settleOutcome = await settleExpense({ organizationId: organization.id, expenseId: expense.id, amount: 300, paymentMethod: "CASH", financialAccountReference: financialAccount.id, actorId: "test-actor" });
    const settlementEntry = await prisma.ledgerEntry.findFirstOrThrow({ where: { organizationId: organization.id, sourceType: "EXPENSE_SETTLEMENT", sourceId: settleOutcome?.settlement.id }, include: { lines: true } });
    expect(balance(settlementEntry.lines)).toEqual({ debit: BigInt(30000), credit: BigInt(30000) });
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } })).status).toBe("PAID");

    const cancellableExpense = await createExpense({ organizationId: organization.id, title: "Ledger validation cancellable expense", category: "OTHER", amount: 150, currency: "TRY", expenseDate: new Date("2026-08-06T09:00:00Z") });
    await cancelExpense({ id: cancellableExpense.id, organizationId: organization.id, reason: "test cancellation" });
    expect(await prisma.ledgerEntry.count({ where: { organizationId: organization.id, sourceType: "EXPENSE", sourceId: cancellableExpense.id, reversalOfId: { not: null } } })).toBe(1);
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: cancellableExpense.id } })).status).toBe("CANCELLED");
    await prisma.$disconnect();
  });
});

function balance(lines: ReadonlyArray<{ debitCents: bigint; creditCents: bigint }>) {
  return {
    debit: lines.reduce((sum, line) => sum + line.debitCents, BigInt(0)),
    credit: lines.reduce((sum, line) => sum + line.creditCents, BigInt(0)),
  };
}
