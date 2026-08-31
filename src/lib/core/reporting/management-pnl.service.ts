import { prisma } from "@/lib/core/shared/prisma";
import type { CurrencyAmount, ManagementPnl } from "./financial-reporting.types";

/**
 * §Management P&L — economic recognition, not cash flow (see cash-flow.service.ts
 * for the cash-basis report). This is deliberately NOT a formal statutory
 * P&L: there is no COGS/inventory-valuation authority anywhere in this
 * codebase, so no gross-margin figure is computed or implied — only revenue,
 * operating expenses, and a net result are reported, matching exactly what
 * canonical data supports.
 *
 * Revenue = Σ Invoice.amount (NET of tax) for invoices with status SENT/PAID,
 * by `createdAt` (Invoice has no dedicated "sent" timestamp — same
 * convention already used by accounting-summary.ts). This mirrors
 * ledger.service.ts::recordInvoiceSent exactly, which credits the 600
 * "Yurtiçi Satışlar" income account with the NET amount, not totalAmount —
 * tax is a liability (391), never revenue.
 *
 * Operating expenses = Σ Expense.amount (FULL amount, not net) for
 * status ≠ CANCELLED, by `expenseDate`, PLUS Σ net LoanRepayment.interestPortion
 * in the period. This mirrors ledger.service.ts::recordExpenseCreated
 * exactly, which debits 770 "Genel Yönetim Gideri" with the full amount
 * (this chart of accounts does not split VAT out of expenses the way it
 * does for invoices).
 *
 * Every hard invariant below is true by CONSTRUCTION (nothing here
 * re-derives or double-counts them — they hold because of what this query
 * does NOT read, not because of extra dedup logic):
 *   - Loan principal (LoanDrawdown/LoanRepayment.principalPortion) is never
 *     read here — Loan/LoanDrawdown/LoanRepayment carry no Expense/Invoice
 *     relation, so principal cannot leak into revenue or expenses.
 *   - Employee advance disbursement/return (EmployeeAdvanceMovement) is
 *     never read here — same structural absence.
 *   - CardStatementPayment / SupplierPayment are never read here — the
 *     underlying Expense (card purchase) / PurchaseInvoice (supplier
 *     invoice) is what would carry economic meaning, and PurchaseInvoice is
 *     deliberately excluded too (see below), so neither payment event can
 *     ever create a second expense.
 *   - A corporate-card Expense is recognized exactly once, at Expense
 *     creation — CardStatementPayment has no Expense relation.
 *   - PurchaseInvoice itself is excluded from operatingExpenses: canonically
 *     it is an inventory/asset acquisition in this ledger (dr Stoklar, not
 *     dr an expense account — see recordPurchaseInvoiceConfirmed), and with
 *     no COGS/inventory-valuation system to later recognize it as an
 *     expense when sold, counting it here would fabricate a metric the data
 *     doesn't support.
 */
export async function computeManagementPnl(organizationId: string, periodStart: Date, periodEnd: Date): Promise<ManagementPnl> {
  const [invoices, expenses, interestOriginal, interestReversal] = await Promise.all([
    prisma.invoice.findMany({
      where: { organizationId, status: { in: ["SENT", "PAID"] }, createdAt: { gte: periodStart, lt: periodEnd } },
      select: { amount: true, currency: true },
    }),
    prisma.expense.findMany({
      where: { organizationId, status: { not: "CANCELLED" }, expenseDate: { gte: periodStart, lt: periodEnd } },
      select: { amount: true, currency: true },
    }),
    prisma.loanRepayment.groupBy({ by: ["currency"], where: { organizationId, kind: "ORIGINAL", occurredAt: { gte: periodStart, lt: periodEnd } }, _sum: { interestPortion: true } }),
    prisma.loanRepayment.groupBy({ by: ["currency"], where: { organizationId, kind: "REVERSAL", occurredAt: { gte: periodStart, lt: periodEnd } }, _sum: { interestPortion: true } }),
  ]);

  const revenue = sumByCurrency(invoices.map((row) => ({ currency: row.currency, amount: Number(row.amount) })));

  const expenseTotals = sumByCurrency(expenses.map((row) => ({ currency: row.currency, amount: Number(row.amount) })));
  const interestByCurrency = new Map<string, number>();
  for (const row of interestOriginal) interestByCurrency.set(row.currency, (interestByCurrency.get(row.currency) ?? 0) + Number(row._sum.interestPortion ?? 0));
  for (const row of interestReversal) interestByCurrency.set(row.currency, (interestByCurrency.get(row.currency) ?? 0) - Number(row._sum.interestPortion ?? 0));
  const operatingExpenses = mergeCurrencyAmounts(expenseTotals, [...interestByCurrency.entries()].map(([currency, amount]) => ({ currency, amount })));

  const netResult = mergeCurrencyAmounts(revenue, operatingExpenses.map((row) => ({ currency: row.currency, amount: -row.amount })));

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    revenue,
    operatingExpenses,
    netResult,
    excludedFromExpenses: [
      "PurchaseInvoice — canonically an inventory/asset acquisition (Ledger: dr Stoklar), not an expense; no COGS/inventory-valuation authority exists to later recognize it as one.",
      "Loan principal (LoanDrawdown/LoanRepayment.principalPortion) — a balance-sheet movement, not revenue or expense.",
      "Employee advance disbursement/return (EmployeeAdvanceMovement) — a balance-sheet movement, not revenue or expense.",
      "CardStatementPayment / SupplierPayment — settlement events only; the underlying Expense/PurchaseInvoice already carries (or in PurchaseInvoice's case, deliberately never carries) the economic meaning.",
    ],
  };
}

function sumByCurrency(rows: readonly CurrencyAmount[]): CurrencyAmount[] {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.amount);
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => ({ currency, amount }));
}

function mergeCurrencyAmounts(...groups: readonly CurrencyAmount[][]): CurrencyAmount[] {
  return sumByCurrency(groups.flat());
}
