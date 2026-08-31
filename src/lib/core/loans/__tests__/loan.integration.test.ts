import { describe, expect, it } from "vitest";

const databaseUrl = process.env.LOAN_INTEGRATION_DATABASE_URL;

/**
 * Aynı gerçek-Postgres, env-var-gated desen (bkz.
 * settlement-concurrency.integration.test.ts). "principal received ≠
 * revenue", "principal repayment ≠ expense; interest = expense"
 * invariant'larını gerçek migrated schema + gerçek ledger üzerinden
 * kanıtlar.
 */
describe.skipIf(!databaseUrl)("Loan drawdown/repayment lifecycle against migrated PostgreSQL", () => {
  async function setup() {
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = await import("@/lib/core/shared/prisma");
    const organization = await prisma.organization.create({ data: { name: `Loan integration ${Date.now()}-${Math.random()}` } });
    const account = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "BANK", name: "Ana Banka", normalizedName: "ana banka", currency: "TRY" } });
    return { prisma, organization, account };
  }

  async function cleanup(prisma: Awaited<ReturnType<typeof setup>>["prisma"], organizationId: string) {
    await prisma.financialAccountMovement.deleteMany({ where: { organizationId } });
    await prisma.loanRepayment.deleteMany({ where: { organizationId } });
    await prisma.loanDrawdown.deleteMany({ where: { organizationId } });
    await prisma.obligationScheduleLine.deleteMany({ where: { organizationId } });
    await prisma.loanInstallment.deleteMany({ where: { organizationId } });
    await prisma.loan.deleteMany({ where: { organizationId } });
    await prisma.ledgerEntryLine.deleteMany({ where: { ledgerEntry: { organizationId } } });
    await prisma.ledgerEntry.deleteMany({ where: { organizationId } });
    await prisma.financialAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  }

  it("PRINCIPAL ≠ REVENUE: drawing a loan increases cash without posting to the sales account", async () => {
    const { prisma, organization, account } = await setup();
    const { createNewLoan, drawLoan } = await import("../loan.service");
    try {
      const { loan, installments } = await createNewLoan({
        organizationId: organization.id, lenderName: "Test Bank", principalAmount: 10000, currency: "TRY", startDate: new Date("2026-09-01T00:00:00.000Z"),
        installments: [{ dueDate: new Date("2026-10-01T00:00:00.000Z"), principalAmount: 5000, interestAmount: 100 }, { dueDate: new Date("2026-11-01T00:00:00.000Z"), principalAmount: 5000, interestAmount: 100 }],
        actorId: "test-actor",
      });
      expect(installments).toHaveLength(2);

      const obligationLines = await prisma.obligationScheduleLine.findMany({ where: { organizationId: organization.id, sourceType: "LOAN_INSTALLMENT" } });
      expect(obligationLines).toHaveLength(2);
      expect(Number(obligationLines[0]!.principalAmount)).toBe(5000);
      expect(Number(obligationLines[0]!.interestAmount)).toBe(100);

      const drawOutcome = await drawLoan({ organizationId: organization.id, loanId: loan.id, amount: 10000, paymentMethod: "BANK_TRANSFER", financialAccountReference: account.id, actorId: "test-actor" });
      expect(drawOutcome?.movement.direction).toBe("IN");
      expect(Number(drawOutcome?.movement.amount)).toBe(10000);

      const ledgerLines = await prisma.ledgerEntryLine.findMany({ where: { ledgerEntry: { organizationId: organization.id, sourceType: "LOAN_DRAWDOWN" } } });
      const touchedSalesAccount = ledgerLines.some((line) => line.accountId === "ledger-account-600");
      expect(touchedSalesAccount).toBe(false);

      // A drawdown cannot exceed the loan's own principal.
      await expect(
        drawLoan({ organizationId: organization.id, loanId: loan.id, amount: 1, paymentMethod: "BANK_TRANSFER", financialAccountReference: account.id, actorId: "test-actor" }),
      ).rejects.toMatchObject({ status: 409 });
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("PRINCIPAL ≠ EXPENSE; INTEREST = EXPENSE: repaying an installment posts interest (not principal) to the expense account", async () => {
    const { prisma, organization, account } = await setup();
    const { createNewLoan, repayLoanInstallment } = await import("../loan.service");
    try {
      const { installments } = await createNewLoan({
        organizationId: organization.id, lenderName: "Test Bank", principalAmount: 1000, currency: "TRY", startDate: new Date("2026-09-01T00:00:00.000Z"),
        installments: [{ dueDate: new Date("2026-10-01T00:00:00.000Z"), principalAmount: 1000, interestAmount: 50 }],
        actorId: "test-actor",
      });
      const installment = installments[0]!;

      const repayOutcome = await repayLoanInstallment({ organizationId: organization.id, loanInstallmentId: installment.id, amount: 1050, principalPortion: 1000, interestPortion: 50, paymentMethod: "BANK_TRANSFER", financialAccountReference: account.id, actorId: "test-actor" });
      expect(Number(repayOutcome?.movement.amount)).toBe(1050);
      expect(repayOutcome?.movement.direction).toBe("OUT");

      const ledgerLines = await prisma.ledgerEntryLine.findMany({ where: { ledgerEntry: { organizationId: organization.id, sourceType: "LOAN_REPAYMENT" } } });
      const principalLine = ledgerLines.find((line) => line.accountId === "ledger-account-400");
      const interestLine = ledgerLines.find((line) => line.accountId === "ledger-account-770");
      expect(Number(principalLine!.debitCents)).toBe(100000); // 1000.00 TRY
      expect(Number(interestLine!.debitCents)).toBe(5000); // 50.00 TRY

      // Cannot repay more than the installment's own total (principal+interest).
      await expect(
        repayLoanInstallment({ organizationId: organization.id, loanInstallmentId: installment.id, amount: 1, principalPortion: 1, interestPortion: 0, paymentMethod: "BANK_TRANSFER", financialAccountReference: account.id, actorId: "test-actor" }),
      ).rejects.toMatchObject({ status: 409 });
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("REVERSAL: reversing a repayment restores the installment's remaining balance", async () => {
    const { prisma, organization, account } = await setup();
    const { createNewLoan, repayLoanInstallment, reverseLoanRepayment } = await import("../loan.service");
    try {
      const { installments } = await createNewLoan({
        organizationId: organization.id, lenderName: "Test Bank", principalAmount: 500, currency: "TRY", startDate: new Date("2026-09-01T00:00:00.000Z"),
        installments: [{ dueDate: new Date("2026-10-01T00:00:00.000Z"), principalAmount: 500 }],
        actorId: "test-actor",
      });
      const installment = installments[0]!;

      const repayOutcome = await repayLoanInstallment({ organizationId: organization.id, loanInstallmentId: installment.id, amount: 500, principalPortion: 500, interestPortion: 0, paymentMethod: "BANK_TRANSFER", financialAccountReference: account.id, actorId: "test-actor" });
      await reverseLoanRepayment({ organizationId: organization.id, loanRepaymentId: repayOutcome!.repayment.id, reason: "yanlış tutar", actorId: "test-actor" });

      // The full 500 must be repayable again after the reversal.
      const secondAttempt = await repayLoanInstallment({ organizationId: organization.id, loanInstallmentId: installment.id, amount: 500, principalPortion: 500, interestPortion: 0, paymentMethod: "BANK_TRANSFER", financialAccountReference: account.id, actorId: "test-actor" });
      expect(secondAttempt).not.toBeNull();
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("CONCURRENT CEILING: two truly concurrent drawdowns that together would exceed the loan principal never both succeed", async () => {
    const { prisma, organization, account } = await setup();
    const { createNewLoan, drawLoan } = await import("../loan.service");
    try {
      const { loan } = await createNewLoan({ organizationId: organization.id, lenderName: "Test Bank", principalAmount: 1000, currency: "TRY", startDate: new Date(), installments: [{ dueDate: new Date("2026-12-01T00:00:00.000Z"), principalAmount: 1000 }], actorId: "test-actor" });

      const attempt = () => drawLoan({ organizationId: organization.id, loanId: loan.id, amount: 600, paymentMethod: "BANK_TRANSFER", financialAccountReference: account.id, actorId: "test-actor" });
      const results = await Promise.allSettled([attempt(), attempt()]);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      expect(fulfilled).toHaveLength(1);

      const drawdowns = await prisma.loanDrawdown.findMany({ where: { organizationId: organization.id, loanId: loan.id, kind: "ORIGINAL" } });
      const total = drawdowns.reduce((sum, drawdown) => sum + Number(drawdown.amount), 0);
      expect(total).toBeLessThanOrEqual(1000);
      expect(total).toBe(600);
    } finally {
      await cleanup(prisma, organization.id);
    }
  });
});
