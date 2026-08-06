import { prisma } from "@/lib/core/shared/prisma";

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
  const openInvoices = invoices.filter((row) => row.status === "SENT");
  const openPayments = payments.filter((row) => ["PENDING", "PARTIAL", "OVERDUE"].includes(row.status));
  const openExpenses = expenses.filter((row) => row.status === "PENDING" || row.status === "OVERDUE");

  return Object.freeze({
    period: Object.freeze({ start: periodStart.toISOString(), endExclusive: periodEnd.toISOString() }),
    metrics: Object.freeze({
      cashPosition: metric(
        subtract(
          payments.filter((row) => Number(row.paidAmount) !== 0).map((row) => ({ currency: row.currency, amount: row.paidAmount })),
          expenses.filter((row) => row.status === "PAID" && Number(row.amount) !== 0).map((row) => ({ currency: row.currency, amount: row.amount })),
        ),
        payments.length > 0 || expenses.length > 0,
        "Yaklaşık gösterge: kümülatif tahsil edilen tutar eksi ödenmiş giderler; banka/kasa bakiyesi değildir.",
      ),
      totalReceivable: metric(
        add([
          ...openInvoices.map((row) => ({ currency: row.currency, amount: row.totalAmount })),
          ...openPayments.map((row) => ({ currency: row.currency, amount: Math.max(Number(row.amount) - Number(row.paidAmount), 0) })),
        ]),
        invoices.length > 0 || payments.length > 0,
        "SENT faturalar ile PENDING/PARTIAL/OVERDUE tahsilat kayıtlarının kalan tutarıdır; kayıtlar ilişkilendirilmediği için olası mükerrerliği ayıramaz.",
      ),
      totalPayable: metric(
        add(openExpenses.map((row) => ({ currency: row.currency, amount: row.amount }))),
        expenses.length > 0,
        "PENDING ve OVERDUE giderlerin toplamıdır.",
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

function subtract(income: readonly MoneyRow[], outgoing: readonly MoneyRow[]): AccountingAmount[] {
  return add([...income, ...outgoing.map((row) => ({ ...row, amount: -Number(row.amount) }))]);
}

function metric(amounts: AccountingAmount[], available: boolean, note: string): AccountingMetric {
  return Object.freeze({ amounts: Object.freeze(amounts), available, note });
}
