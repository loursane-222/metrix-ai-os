/**
 * Phase 13 — Canonical Reporting & Financial Intelligence.
 *
 * Every type/function under src/lib/core/reporting/ is READ-ONLY: nothing
 * here ever calls a Prisma write method, and nothing here is a new
 * financial transaction authority. "Financial Reality → Reporting" is
 * one-way — see each service file's own header comment for the specific
 * canonical source it derives from.
 */

export type CurrencyAmount = { currency: string; amount: number };

export type CashPositionAccountEntry = {
  financialAccountId: string;
  name: string;
  type: "CASH" | "BANK";
  currency: string;
  balance: number;
};

export type ActualCashPosition = {
  asOf: string;
  accounts: CashPositionAccountEntry[];
  /** Same-currency sums only — never blended across currencies (no FX invented). */
  totalsByCurrency: CurrencyAmount[];
};

export type CashFlowCategory =
  | "customer_collection"
  | "supplier_payment"
  | "expense_settlement"
  | "card_statement_payment"
  | "employee_advance"
  | "loan_drawdown"
  | "loan_repayment";

export type CashFlowCategoryTotal = { category: CashFlowCategory; direction: "IN" | "OUT"; currency: string; amount: number };

export type CashFlowAccountTotal = { financialAccountId: string; name: string; currency: string; inflow: number; outflow: number; net: number };

export type ActualCashFlow = {
  periodStart: string;
  periodEnd: string;
  byCategory: CashFlowCategoryTotal[];
  byAccount: CashFlowAccountTotal[];
  netByCurrency: CurrencyAmount[];
};

export type ForecastCashFlowTotal = { direction: "RECEIVABLE" | "PAYABLE"; currency: string; amount: number };

export type ForecastCashFlow = {
  asOf: string;
  horizonEnd: string;
  totals: ForecastCashFlowTotal[];
  items: Array<{ id: string; title: string; dueDate: string; direction: "RECEIVABLE" | "PAYABLE"; status: string; amount: number; currency: string }>;
};

export type AgingBucket = "NOT_YET_DUE" | "DUE_TODAY" | "OVERDUE";

export type AgingItem = {
  id: string;
  title: string;
  dueDate: string;
  bucket: AgingBucket;
  amount: number;
  currency: string;
};

export type AgingBucketTotal = { bucket: AgingBucket; currency: string; amount: number };

export type AgingReport = {
  asOf: string;
  direction: "RECEIVABLE" | "PAYABLE";
  items: AgingItem[];
  totalsByBucket: AgingBucketTotal[];
};

export type ManagementPnl = {
  periodStart: string;
  periodEnd: string;
  revenue: CurrencyAmount[];
  operatingExpenses: CurrencyAmount[];
  netResult: CurrencyAmount[];
  /** What's deliberately NOT in operatingExpenses, and why — see management-pnl.service.ts header. */
  excludedFromExpenses: readonly string[];
};

export type ActualVsForecast = {
  asOf: string;
  actualToDate: { currency: string; inflow: number; outflow: number; net: number }[];
  forecastRemaining: { currency: string; inflow: number; outflow: number; net: number }[];
};
