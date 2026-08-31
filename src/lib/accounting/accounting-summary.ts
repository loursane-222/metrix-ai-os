import { prisma } from "@/lib/core/shared/prisma";
import { computeActualCashPosition } from "@/lib/core/reporting/cash-position.service";
import { computeAgingReport } from "@/lib/core/reporting/obligation-aging.service";

export type AccountingAmount = Readonly<{ currency: string; amount: number }>;
export type AccountingMetric = Readonly<{
  amounts: readonly AccountingAmount[];
  available: boolean;
  note: string;
}>;
export type AccountingSummary = Readonly<{
  period: Readonly<{ start: string; endExclusive: string }>;
  metrics: Readonly<{
    cashPosition: AccountingMetric;
    totalReceivable: AccountingMetric;
    totalPayable: AccountingMetric;
    monthlyRevenue: AccountingMetric;
    monthlyExpense: AccountingMetric;
    monthlyTaxLiability: AccountingMetric;
  }>;
  sourceCounts: Readonly<{ invoices: number; payments: number; expenses: number }>;
}>;

type MoneyRow = { currency: string; amount: unknown };

export async function getAccountingSummary(
  organizationId: string,
  now = new Date(),
): Promise<AccountingSummary> {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [invoices, payments, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: { organizationId },
      select: { totalAmount: true, taxAmount: true, currency: true, status: true, createdAt: true },
    }),
    prisma.payment.findMany({
      where: { organizationId },
      select: { amount: true, paidAmount: true, currency: true, status: true },
    }),
    prisma.expense.findMany({
      where: { organizationId },
      select: { amount: true, currency: true, status: true, expenseDate: true },
    }),
  ]);

  const issuedThisMonth = invoices.filter((row) =>
    (row.status === "SENT" || row.status === "PAID")
    && row.createdAt >= periodStart
    && row.createdAt < periodEnd,
  );
  const expensesThisMonth = expenses.filter((row) =>
    row.status !== "CANCELLED" && row.expenseDate >= periodStart && row.expenseDate < periodEnd,
  );

  // Phase 13: cashPosition/totalReceivable/totalPayable now derive from
  // canonical Phase 3-12 authority (FinancialAccountMovement / canonical
  // aging over ObligationScheduleLine) instead of the Payment/Expense
  // status-cache approximation this file used before — see
  // src/lib/core/reporting/. External shape (AccountingMetric) is
  // unchanged so every existing consumer (AccountingSummarySurface, the
  // KPI goals engine, business-overview-synthesis) keeps working, now with
  // correct numbers instead of approximate ones.
  const [cashPositionCanonical, receivableAging, payableAging] = await Promise.all([
    computeActualCashPosition(organizationId, now),
    computeAgingReport(organizationId, "RECEIVABLE", now),
    computeAgingReport(organizationId, "PAYABLE", now),
  ]);

  return Object.freeze({
    period: Object.freeze({ start: periodStart.toISOString(), endExclusive: periodEnd.toISOString() }),
    metrics: Object.freeze({
      cashPosition: metric(
        cashPositionCanonical.totalsByCurrency,
        cashPositionCanonical.accounts.length > 0,
        "Canonical FinancialAccountMovement hareketlerinden türetilen gerçek kasa/banka bakiyesi (hesap ve para birimi bazında ayrıştırılmış toplam — bkz. /api/reports/financial/cash-position).",
      ),
      totalReceivable: metric(
        sumAgingByCurrency(receivableAging.totalsByBucket),
        invoices.length > 0 || payments.length > 0,
        "Canonical ObligationScheduleLine üzerinden hesaplanan, henüz kapanmamış tüm tahsilatların kalan tutarı (bkz. /api/reports/financial/aging?direction=RECEIVABLE).",
      ),
      totalPayable: metric(
        sumAgingByCurrency(payableAging.totalsByBucket),
        expenses.length > 0,
        "Canonical ObligationScheduleLine üzerinden hesaplanan, gider/tedarikçi faturası/kart ekstresi/kredi taksiti dahil henüz kapanmamış tüm ödemelerin kalan tutarı (bkz. /api/reports/financial/aging?direction=PAYABLE).",
      ),
      monthlyRevenue: metric(
        add(issuedThisMonth.map((row) => ({ currency: row.currency, amount: row.totalAmount }))),
        invoices.length > 0,
        "Bu ay oluşturulmuş, mevcut durumu SENT veya PAID olan faturaların brüt toplamıdır; sentAt alanı yoktur.",
      ),
      monthlyExpense: metric(
        add(expensesThisMonth.map((row) => ({ currency: row.currency, amount: row.amount }))),
        expenses.length > 0,
        "expenseDate bu ay içinde olan, CANCELLED dışındaki giderlerin toplamıdır.",
      ),
      monthlyTaxLiability: metric(
        add(issuedThisMonth.map((row) => ({ currency: row.currency, amount: row.taxAmount }))),
        invoices.length > 0,
        "Bu ay oluşturulmuş, mevcut durumu SENT veya PAID olan faturaların taxAmount toplamıdır; mahsup/ödenen vergi bilgisi yoktur.",
      ),
    }),
    sourceCounts: Object.freeze({ invoices: invoices.length, payments: payments.length, expenses: expenses.length }),
  });
}

function add(rows: readonly MoneyRow[]): AccountingAmount[] {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.currency, (totals.get(row.currency) ?? 0) + Number(row.amount));
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => ({ currency, amount }));
}

function sumAgingByCurrency(totalsByBucket: readonly { bucket: string; currency: string; amount: number }[]): AccountingAmount[] {
  return add(totalsByBucket.map((row) => ({ currency: row.currency, amount: row.amount })));
}

function metric(amounts: AccountingAmount[], available: boolean, note: string): AccountingMetric {
  return Object.freeze({ amounts: Object.freeze(amounts), available, note });
}
