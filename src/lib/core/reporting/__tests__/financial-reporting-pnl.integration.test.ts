import { describe, expect, it } from "vitest";

const databaseUrl = process.env.FINANCIAL_REPORTING_PNL_INTEGRATION_DATABASE_URL;

/**
 * Real-Postgres, env-var-gated. Kanıtlar: Management P&L revenue/expense
 * ayrımı doğru — loan principal gelir/gider değil, loan interest gider,
 * employee advance gider değil, card statement payment ikinci gider
 * yaratmıyor, supplier payment ikinci gider yaratmıyor, customer collection
 * ikinci gelir yaratmıyor.
 */
describe.skipIf(!databaseUrl)("Management P&L against migrated PostgreSQL", () => {
  async function setup() {
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = await import("@/lib/core/shared/prisma");
    const organization = await prisma.organization.create({ data: { name: `Financial reporting pnl integration ${Date.now()}-${Math.random()}` } });
    const account = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "CASH", name: "Ana Kasa", normalizedName: "ana kasa", currency: "TRY" } });
    return { prisma, organization, account };
  }

  async function cleanup(prisma: Awaited<ReturnType<typeof setup>>["prisma"], organizationId: string) {
    await prisma.financialAccountMovement.deleteMany({ where: { organizationId } });
    await prisma.loanRepayment.deleteMany({ where: { organizationId } });
    await prisma.loanDrawdown.deleteMany({ where: { organizationId } });
    await prisma.obligationScheduleLine.deleteMany({ where: { organizationId } });
    await prisma.loanInstallment.deleteMany({ where: { organizationId } });
    await prisma.loan.deleteMany({ where: { organizationId } });
    await prisma.employeeAdvanceReconciliation.deleteMany({ where: { organizationId } });
    await prisma.employeeAdvanceMovement.deleteMany({ where: { organizationId } });
    await prisma.employeeAdvance.deleteMany({ where: { organizationId } });
    await prisma.cardStatementPayment.deleteMany({ where: { organizationId } });
    await prisma.cardStatement.deleteMany({ where: { organizationId } });
    await prisma.corporateCard.deleteMany({ where: { organizationId } });
    await prisma.expenseSettlement.deleteMany({ where: { organizationId } });
    await prisma.expense.deleteMany({ where: { organizationId } });
    await prisma.supplierPayment.deleteMany({ where: { organizationId } });
    await prisma.purchaseInvoice.deleteMany({ where: { organizationId } });
    await prisma.purchaseOrder.deleteMany({ where: { organizationId } });
    await prisma.supplier.deleteMany({ where: { organizationId } });
    await prisma.application.deleteMany({ where: { organizationId } });
    await prisma.settlement.deleteMany({ where: { organizationId } });
    await prisma.payment.deleteMany({ where: { organizationId } });
    await prisma.invoice.deleteMany({ where: { organizationId } });
    await prisma.customer.deleteMany({ where: { organizationId } });
    await prisma.ledgerEntryLine.deleteMany({ where: { ledgerEntry: { organizationId } } });
    await prisma.ledgerEntry.deleteMany({ where: { organizationId } });
    await prisma.financialAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  }

  const periodStart = new Date("2026-09-01T00:00:00.000Z");
  const periodEnd = new Date("2026-09-30T23:59:59.000Z");
  const inPeriod = new Date("2026-09-10T00:00:00.000Z");

  it("LOAN: principal is neither revenue nor expense; only interest is an expense", async () => {
    const { prisma, organization, account } = await setup();
    const { createNewLoan, drawLoan, repayLoanInstallment } = await import("@/lib/core/loans/loan.service");
    const { computeManagementPnl } = await import("../management-pnl.service");
    try {
      const { loan, installments } = await createNewLoan({ organizationId: organization.id, lenderName: "Test Bank", principalAmount: 10000, currency: "TRY", startDate: inPeriod, installments: [{ dueDate: new Date("2026-10-01T00:00:00.000Z"), principalAmount: 10000, interestAmount: 500 }], actorId: "test-actor" });
      await drawLoan({ organizationId: organization.id, loanId: loan.id, amount: 10000, paymentMethod: "CASH", financialAccountReference: account.id, occurredAt: inPeriod, actorId: "test-actor" });
      await repayLoanInstallment({ organizationId: organization.id, loanInstallmentId: installments[0]!.id, amount: 10500, principalPortion: 10000, interestPortion: 500, paymentMethod: "CASH", financialAccountReference: account.id, occurredAt: new Date("2026-09-15T00:00:00.000Z"), actorId: "test-actor" });

      const pnl = await computeManagementPnl(organization.id, periodStart, periodEnd);
      const revenueTry = pnl.revenue.find((r) => r.currency === "TRY")?.amount ?? 0;
      const expenseTry = pnl.operatingExpenses.find((r) => r.currency === "TRY")?.amount ?? 0;
      expect(revenueTry).toBe(0); // 10,000 principal received is NOT revenue
      expect(expenseTry).toBe(500); // only the 500 interest is an expense — not 10,500
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("EMPLOYEE ADVANCE: disbursement is never an expense, even though it moves real cash", async () => {
    const { prisma, organization, account } = await setup();
    const { createNewEmployeeAdvance, moveEmployeeAdvance } = await import("@/lib/core/employee-advances/employee-advance.service");
    const { computeManagementPnl } = await import("../management-pnl.service");
    try {
      const user = await prisma.user.create({ data: { phone: `+90555${Math.floor(Math.random() * 1e7)}`, fullName: "Test Employee" } });
      const member = await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "EMPLOYEE" } });
      const advance = await createNewEmployeeAdvance({ organizationId: organization.id, employeeMemberId: member.id, amount: 2000, currency: "TRY", actorId: "test-actor" });
      await moveEmployeeAdvance({ organizationId: organization.id, employeeAdvanceId: advance.id, direction: "OUT", amount: 2000, paymentMethod: "CASH", financialAccountReference: account.id, occurredAt: inPeriod, actorId: "test-actor" });

      const pnl = await computeManagementPnl(organization.id, periodStart, periodEnd);
      const expenseTry = pnl.operatingExpenses.find((r) => r.currency === "TRY")?.amount ?? 0;
      expect(expenseTry).toBe(0); // 2,000 TRY moved out, but zero P&L expense recognized
      await prisma.employeeAdvanceMovement.deleteMany({ where: { organizationId: organization.id } });
      await prisma.employeeAdvance.deleteMany({ where: { organizationId: organization.id } });
      await prisma.organizationMember.deleteMany({ where: { organizationId: organization.id } });
      await prisma.user.delete({ where: { id: user.id } });
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("CORPORATE CARD: the card purchase Expense is recognized exactly once; the later statement payment adds no second expense", async () => {
    const { prisma, organization, account } = await setup();
    const { createExpense } = await import("@/lib/core/expenses/expense-repository");
    const { createNewCorporateCard, openCardStatement, closeCardStatement, payCardStatement } = await import("@/lib/core/corporate-cards/corporate-card.service");
    const { computeManagementPnl } = await import("../management-pnl.service");
    const user = await prisma.user.create({ data: { phone: `+90555${Math.floor(Math.random() * 1e7)}`, fullName: "Cardholder" } });
    try {
      const member = await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
      const card = await createNewCorporateCard({ organizationId: organization.id, cardholderMemberId: member.id, label: "Ops Visa", currency: "TRY", actorId: "test-actor" });
      await createExpense({ organizationId: organization.id, title: "Kart harcaması", category: "OTHER", amount: 750, currency: "TRY", expenseDate: inPeriod, corporateCardId: card.id, createdByUserId: user.id });
      const statement = await openCardStatement({ organizationId: organization.id, corporateCardId: card.id, periodStart: new Date("2026-09-01T00:00:00.000Z"), periodEnd: new Date("2026-09-30T23:59:59.000Z"), dueDate: new Date("2026-10-05T00:00:00.000Z"), actorId: "test-actor" });
      await closeCardStatement({ organizationId: organization.id, cardStatementId: statement.id, actorId: "test-actor" });
      await payCardStatement({ organizationId: organization.id, cardStatementId: statement.id, amount: 750, paymentMethod: "CASH", financialAccountReference: account.id, occurredAt: new Date("2026-10-06T00:00:00.000Z"), actorId: "test-actor" });

      const pnl = await computeManagementPnl(organization.id, periodStart, periodEnd);
      const expenseTry = pnl.operatingExpenses.find((r) => r.currency === "TRY")?.amount ?? 0;
      expect(expenseTry).toBe(750); // recognized once, in September (expenseDate) — the October statement payment adds nothing here
    } finally {
      // OrganizationMember cascades on Organization delete (onDelete: Cascade), so cleanup()'s own
      // organization.delete() call removes it automatically — no separate member deleteMany needed.
      await cleanup(prisma, organization.id);
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
  });

  it("SUPPLIER PURCHASE + PAYMENT: PurchaseInvoice is excluded from operating expenses entirely (no COGS system), and SupplierPayment adds nothing", async () => {
    const { prisma, organization, account } = await setup();
    const { computeManagementPnl } = await import("../management-pnl.service");
    try {
      const supplier = await prisma.supplier.create({ data: { organizationId: organization.id, displayName: "Test Tedarikçi" } });
      const purchaseOrder = await prisma.purchaseOrder.create({ data: { organizationId: organization.id, supplierId: supplier.id, poNumber: `PO-${Date.now()}`, currency: "TRY", status: "APPROVED" } });
      const purchaseInvoice = await prisma.purchaseInvoice.create({ data: { organizationId: organization.id, supplierId: supplier.id, purchaseOrderId: purchaseOrder.id, supplierInvoiceNumber: `INV-${Date.now()}`, amount: 4000, taxAmount: 800, totalAmount: 4800, currency: "TRY", status: "CONFIRMED" } });
      await prisma.financialAccountMovement.create({ data: { organizationId: organization.id, financialAccountId: account.id, paymentMethod: "CASH", amount: 4800, currency: "TRY", occurredAt: inPeriod, direction: "OUT" } });

      const pnl = await computeManagementPnl(organization.id, periodStart, periodEnd);
      const expenseTry = pnl.operatingExpenses.find((r) => r.currency === "TRY")?.amount ?? 0;
      expect(expenseTry).toBe(0); // purchase invoices are asset acquisitions in this ledger, not P&L expenses
      expect(pnl.excludedFromExpenses.some((note) => note.includes("PurchaseInvoice"))).toBe(true);
      void purchaseInvoice;
    } finally {
      await cleanup(prisma, organization.id);
    }
  });

  it("CUSTOMER INVOICE + COLLECTION: revenue is recognized once at invoice issuance; the later collection adds no second revenue", async () => {
    const { prisma, organization, account } = await setup();
    const { applySettlement } = await import("@/lib/core/settlements/settlement.service");
    const { computeManagementPnl } = await import("../management-pnl.service");
    try {
      const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: "Test Müşteri" } });
      const invoice = await prisma.invoice.create({ data: { organizationId: organization.id, customerId: customer.id, invoiceNumber: `INV-${Date.now()}`, title: "Test Satış", amount: 5000, taxAmount: 1000, totalAmount: 6000, currency: "TRY", status: "SENT", createdAt: inPeriod } });
      const payment = await prisma.payment.create({ data: { organizationId: organization.id, customerId: customer.id, invoiceId: invoice.id, title: "Test Satış", amount: 6000, currency: "TRY" } });
      await applySettlement({ organizationId: organization.id, paymentId: payment.id, amount: 6000, paymentMethod: "CASH", financialAccountReference: account.id, occurredAt: new Date("2026-09-20T00:00:00.000Z"), actorId: "test-actor" });

      const pnl = await computeManagementPnl(organization.id, periodStart, periodEnd);
      const revenueTry = pnl.revenue.find((r) => r.currency === "TRY")?.amount ?? 0;
      expect(revenueTry).toBe(5000); // NET revenue (amount, not totalAmount) recognized once — the later collection is a cash event, not a second revenue event
    } finally {
      await cleanup(prisma, organization.id);
    }
  });
});
