import { prisma } from "@/lib/core/shared/prisma";
import { sumNetCardStatementPayments } from "@/lib/core/corporate-cards/corporate-card.repository";
import { sumNetLoanRepayments } from "@/lib/core/loans/loan.repository";
import { sumNetReconciliationsForExpense } from "@/lib/core/employee-advances/employee-advance.repository";
import { classifyFinancialDueStatus, DEFAULT_TIME_ZONE, type FinancialDueStatus } from "./calendar-timezone";

const AMOUNT_EPSILON = 0.005;

export type FinancialCalendarProjectionItem = {
  id: string;
  title: string;
  dueDate: string;
  kind: string;
  status: FinancialDueStatus;
  amount: number;
  currency: string;
  /**
   * Phase 13 addition (additive — existing Calendar frontend consumer reads
   * only id/title/dueDate/kind/status and ignores unknown fields): RECEIVABLE
   * = money owed to us (inflow when settled), PAYABLE = money we owe
   * (outflow when settled). Lets forecast-cash-flow/aging reporting reuse
   * this same canonical projection instead of re-deriving it.
   */
  direction: "RECEIVABLE" | "PAYABLE";
  customerId?: string | null;
  customerName?: string | null;
  originalAmount?: number;
  currentStatus?: string;
};

/**
 * §Financial Reality → Calendar/Notification, one-way. Pure read: every
 * amount/status here is recomputed from Phase 1-11 canonical authority on
 * every call — nothing is cached, nothing is persisted, so there is
 * structurally no desync/duplicate/staleness to guard against. Never write
 * to ObligationScheduleLine/Expense/CardStatement/LoanInstallment/
 * FinancialInstrument from here or from any caller of this function.
 *
 * `dueDateFrom` is optional — omit it (as the notification scheduler does)
 * to include obligations that became overdue arbitrarily long ago; the
 * calendar route always supplies both bounds (the visible date range).
 */
export async function computeFinancialObligationProjections(input: {
  organizationId: string;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  timeZone?: string;
  now?: Date;
}): Promise<FinancialCalendarProjectionItem[]> {
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const now = input.now ?? new Date();

  const [obligationItems, instrumentItems] = await Promise.all([
    projectObligationScheduleLines(input.organizationId, input.dueDateFrom, input.dueDateTo, timeZone, now),
    projectFinancialInstruments(input.organizationId, input.dueDateFrom, input.dueDateTo, timeZone, now),
  ]);

  return [...obligationItems, ...instrumentItems].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

async function projectObligationScheduleLines(organizationId: string, dueDateFrom: Date | undefined, dueDateTo: Date | undefined, timeZone: string, now: Date): Promise<FinancialCalendarProjectionItem[]> {
  const lines = await prisma.obligationScheduleLine.findMany({
    where: { organizationId, dueDate: { ...(dueDateFrom ? { gte: dueDateFrom } : {}), ...(dueDateTo ? { lte: dueDateTo } : {}) } },
  });
  if (lines.length === 0) return [];

  const byType = {
    INVOICE: lines.filter((line) => line.sourceType === "INVOICE"),
    EXPENSE: lines.filter((line) => line.sourceType === "EXPENSE"),
    PURCHASE_INVOICE: lines.filter((line) => line.sourceType === "PURCHASE_INVOICE"),
    CARD_STATEMENT: lines.filter((line) => line.sourceType === "CARD_STATEMENT"),
    LOAN_INSTALLMENT: lines.filter((line) => line.sourceType === "LOAN_INSTALLMENT"),
  };

  const [receivables, payables, purchasePayables, cardPayables, loanPayables] = await Promise.all([
    projectReceivables(organizationId, byType.INVOICE, timeZone, now),
    projectExpensePayables(organizationId, byType.EXPENSE, timeZone, now),
    projectPurchaseInvoicePayables(organizationId, byType.PURCHASE_INVOICE, timeZone, now),
    projectCardStatementPayables(organizationId, byType.CARD_STATEMENT, timeZone, now),
    projectLoanInstallmentPayables(organizationId, byType.LOAN_INSTALLMENT, timeZone, now),
  ]);

  return [...receivables, ...payables, ...purchasePayables, ...cardPayables, ...loanPayables];
}

async function projectReceivables(organizationId: string, lines: Array<{ id: string; paymentId: string | null; dueDate: Date; originalAmount: unknown }>, timeZone: string, now: Date): Promise<FinancialCalendarProjectionItem[]> {
  const paymentIds = lines.flatMap((line) => (line.paymentId ? [line.paymentId] : []));
  if (paymentIds.length === 0) return [];
  const payments = await prisma.payment.findMany({ where: { organizationId, id: { in: paymentIds } }, include: { customer: { select: { displayName: true } } } });
  const byId = new Map(payments.map((payment) => [payment.id, payment]));

  const items: FinancialCalendarProjectionItem[] = [];
  for (const line of lines) {
    const payment = line.paymentId ? byId.get(line.paymentId) : undefined;
    if (!payment || payment.status === "CANCELLED" || payment.status === "WRITTEN_OFF") continue;
    const remaining = Number(payment.amount) - Number(payment.paidAmount);
    if (remaining <= AMOUNT_EPSILON) continue;
    items.push({
      id: `obligation:${line.id}`,
      title: payment.title,
      dueDate: line.dueDate.toISOString(),
      kind: "Tahsilat",
      status: classifyFinancialDueStatus(line.dueDate, now, timeZone),
      amount: remaining,
      currency: payment.currency,
      direction: "RECEIVABLE",
      customerId: payment.customerId,
      customerName: payment.customer?.displayName ?? null,
      originalAmount: Number(line.originalAmount),
      currentStatus: payment.status,
    });
  }
  return items;
}

async function projectExpensePayables(organizationId: string, lines: Array<{ id: string; expenseId: string | null; dueDate: Date }>, timeZone: string, now: Date): Promise<FinancialCalendarProjectionItem[]> {
  const expenseIds = lines.flatMap((line) => (line.expenseId ? [line.expenseId] : []));
  if (expenseIds.length === 0) return [];
  const expenses = await prisma.expense.findMany({ where: { organizationId, id: { in: expenseIds } } });
  const byId = new Map(expenses.map((expense) => [expense.id, expense]));

  const items: FinancialCalendarProjectionItem[] = [];
  for (const line of lines) {
    const expense = line.expenseId ? byId.get(line.expenseId) : undefined;
    if (!expense || expense.status === "CANCELLED") continue;
    // Phase 11: a corporate-card expense's real obligation lives on its
    // CardStatement (CARD_STATEMENT sourceType, projected separately) — its
    // own EXPENSE-sourceType schedule line is never materialized (blocked by
    // obligation-schedule.service.ts), so this branch never actually sees one
    // in practice; the check is defensive, not load-bearing.
    if (expense.corporateCardId) continue;
    const reconciledViaAdvance = await sumNetReconciliationsForExpense(organizationId, expense.id, prisma);
    const remaining = Number(expense.amount) - Number(expense.paidAmount) - reconciledViaAdvance;
    if (remaining <= AMOUNT_EPSILON) continue;
    items.push({
      id: `obligation:${line.id}`,
      title: expense.title,
      dueDate: line.dueDate.toISOString(),
      kind: expense.category === "PAYROLL" ? "Maaş Ödemesi" : expense.category === "TAX" ? "Vergi / SGK Ödemesi" : "Gider Ödemesi",
      status: classifyFinancialDueStatus(line.dueDate, now, timeZone),
      amount: remaining,
      currency: expense.currency,
      direction: "PAYABLE",
    });
  }
  return items;
}

async function projectPurchaseInvoicePayables(organizationId: string, lines: Array<{ id: string; purchaseInvoiceId: string | null; dueDate: Date }>, timeZone: string, now: Date): Promise<FinancialCalendarProjectionItem[]> {
  const invoiceIds = lines.flatMap((line) => (line.purchaseInvoiceId ? [line.purchaseInvoiceId] : []));
  if (invoiceIds.length === 0) return [];
  const invoices = await prisma.purchaseInvoice.findMany({ where: { organizationId, id: { in: invoiceIds } }, include: { supplier: { select: { displayName: true } } } });
  const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));

  const items: FinancialCalendarProjectionItem[] = [];
  for (const line of lines) {
    const invoice = line.purchaseInvoiceId ? byId.get(line.purchaseInvoiceId) : undefined;
    if (!invoice || invoice.status === "CANCELLED" || invoice.status === "DRAFT") continue;
    const remaining = Number(invoice.totalAmount) - Number(invoice.paidAmount);
    if (remaining <= AMOUNT_EPSILON) continue;
    items.push({
      id: `obligation:${line.id}`,
      title: `${invoice.supplier.displayName} — ${invoice.supplierInvoiceNumber}`,
      dueDate: line.dueDate.toISOString(),
      kind: "Tedarikçi Ödemesi",
      status: classifyFinancialDueStatus(line.dueDate, now, timeZone),
      amount: remaining,
      currency: invoice.currency,
      direction: "PAYABLE",
    });
  }
  return items;
}

async function projectCardStatementPayables(organizationId: string, lines: Array<{ id: string; cardStatementId: string | null; dueDate: Date }>, timeZone: string, now: Date): Promise<FinancialCalendarProjectionItem[]> {
  const statementIds = lines.flatMap((line) => (line.cardStatementId ? [line.cardStatementId] : []));
  if (statementIds.length === 0) return [];
  const statements = await prisma.cardStatement.findMany({ where: { organizationId, id: { in: statementIds } }, include: { corporateCard: { select: { label: true } } } });
  const byId = new Map(statements.map((statement) => [statement.id, statement]));

  const items: FinancialCalendarProjectionItem[] = [];
  for (const line of lines) {
    const statement = line.cardStatementId ? byId.get(line.cardStatementId) : undefined;
    if (!statement || statement.status === "CANCELLED" || statement.totalAmount === null) continue;
    const paid = await sumNetCardStatementPayments(organizationId, statement.id, prisma);
    const remaining = Number(statement.totalAmount) - paid;
    if (remaining <= AMOUNT_EPSILON) continue;
    items.push({
      id: `obligation:${line.id}`,
      title: `${statement.corporateCard.label} Ekstresi`,
      dueDate: line.dueDate.toISOString(),
      kind: "Kart Ekstresi",
      status: classifyFinancialDueStatus(line.dueDate, now, timeZone),
      amount: remaining,
      currency: statement.currency,
      direction: "PAYABLE",
    });
  }
  return items;
}

async function projectLoanInstallmentPayables(organizationId: string, lines: Array<{ id: string; loanInstallmentId: string | null; dueDate: Date; principalAmount: unknown; interestAmount: unknown }>, timeZone: string, now: Date): Promise<FinancialCalendarProjectionItem[]> {
  const installmentIds = lines.flatMap((line) => (line.loanInstallmentId ? [line.loanInstallmentId] : []));
  if (installmentIds.length === 0) return [];
  const installments = await prisma.loanInstallment.findMany({ where: { organizationId, id: { in: installmentIds } }, include: { loan: { select: { lenderName: true, status: true } } } });
  const byId = new Map(installments.map((installment) => [installment.id, installment]));

  const items: FinancialCalendarProjectionItem[] = [];
  for (const line of lines) {
    const installment = line.loanInstallmentId ? byId.get(line.loanInstallmentId) : undefined;
    if (!installment || installment.loan.status === "CANCELLED") continue;
    const paid = await sumNetLoanRepayments(organizationId, installment.id, prisma);
    const total = Number(installment.principalAmount) + Number(installment.interestAmount);
    const remaining = total - paid;
    if (remaining <= AMOUNT_EPSILON) continue;
    items.push({
      id: `obligation:${line.id}`,
      title: `${installment.loan.lenderName} — Taksit ${installment.installmentIndex + 1}`,
      dueDate: line.dueDate.toISOString(),
      kind: "Kredi Taksiti",
      status: classifyFinancialDueStatus(line.dueDate, now, timeZone),
      amount: remaining,
      currency: installment.currency,
      direction: "PAYABLE",
    });
  }
  return items;
}

async function projectFinancialInstruments(organizationId: string, dueDateFrom: Date | undefined, dueDateTo: Date | undefined, timeZone: string, now: Date): Promise<FinancialCalendarProjectionItem[]> {
  const instruments = await prisma.financialInstrument.findMany({
    where: {
      organizationId,
      status: { in: ["REGISTERED", "ALLOCATED"] },
      maturityDate: { ...(dueDateFrom ? { gte: dueDateFrom } : {}), ...(dueDateTo ? { lte: dueDateTo } : {}) },
    },
    include: { customer: { select: { displayName: true } }, supplier: { select: { displayName: true } } },
  });

  return instruments.map((instrument) => {
    const counterparty = instrument.customer?.displayName ?? instrument.supplier?.displayName ?? "";
    const instrumentLabel = instrument.instrumentType === "CHEQUE" ? "Çek" : "Senet";
    const directionLabel = instrument.direction === "RECEIVED" ? "Alınan" : "Verilen";
    return {
      id: `instrument:${instrument.id}`,
      title: `${directionLabel} ${instrumentLabel}${counterparty ? ` — ${counterparty}` : ""}`,
      dueDate: instrument.maturityDate.toISOString(),
      kind: `${directionLabel} ${instrumentLabel}`,
      status: classifyFinancialDueStatus(instrument.maturityDate, now, timeZone),
      amount: Number(instrument.amount),
      currency: instrument.currency,
      direction: instrument.direction === "RECEIVED" ? "RECEIVABLE" : "PAYABLE",
      customerId: instrument.customerId,
      customerName: instrument.customer?.displayName ?? null,
      originalAmount: Number(instrument.amount),
      currentStatus: instrument.status,
    };
  });
}
