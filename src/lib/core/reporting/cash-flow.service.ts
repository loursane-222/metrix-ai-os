import { prisma } from "@/lib/core/shared/prisma";
import type { CashFlowAccountTotal, CashFlowCategory, CashFlowCategoryTotal, ActualCashFlow, ActualVsForecast } from "./financial-reporting.types";
import { computeForecastCashFlow } from "./forecast-cash-flow.service";

/**
 * §Actual Cash Flow — realized movement only, from `FinancialAccountMovement`
 * within [periodStart, periodEnd). Never mixed with economic revenue/expense
 * (Invoice/Expense recognition) — see management-pnl.service.ts for that,
 * a structurally separate report.
 *
 * Category is derived from WHICH of the seven nullable typed FKs on a
 * movement row is set (exactly one always is, by Phase 3-11 construction —
 * see FinancialAccountMovement's own schema comment) rather than stored
 * redundantly, so this can never drift from the real write path.
 */
export async function computeActualCashFlow(organizationId: string, periodStart: Date, periodEnd: Date): Promise<ActualCashFlow> {
  const [movements, accounts] = await Promise.all([
    prisma.financialAccountMovement.findMany({ where: { organizationId, occurredAt: { gte: periodStart, lt: periodEnd } } }),
    prisma.financialAccount.findMany({ where: { organizationId }, select: { id: true, name: true, currency: true } }),
  ]);
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  const byCategoryKey = new Map<string, CashFlowCategoryTotal>();
  const byAccountKey = new Map<string, CashFlowAccountTotal>();
  const netByCurrencyMap = new Map<string, number>();

  for (const movement of movements) {
    const category = categorize(movement);
    const amount = Number(movement.amount);
    const signedForNet = movement.direction === "IN" ? amount : -amount;

    const categoryKey = `${category}:${movement.direction}:${movement.currency}`;
    const existingCategory = byCategoryKey.get(categoryKey);
    byCategoryKey.set(categoryKey, { category, direction: movement.direction, currency: movement.currency, amount: (existingCategory?.amount ?? 0) + amount });

    const account = accountById.get(movement.financialAccountId);
    const accountKey = movement.financialAccountId;
    const existingAccount = byAccountKey.get(accountKey) ?? { financialAccountId: movement.financialAccountId, name: account?.name ?? movement.financialAccountId, currency: account?.currency ?? movement.currency, inflow: 0, outflow: 0, net: 0 };
    if (movement.direction === "IN") existingAccount.inflow += amount;
    else existingAccount.outflow += amount;
    existingAccount.net = existingAccount.inflow - existingAccount.outflow;
    byAccountKey.set(accountKey, existingAccount);

    netByCurrencyMap.set(movement.currency, (netByCurrencyMap.get(movement.currency) ?? 0) + signedForNet);
  }

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    byCategory: [...byCategoryKey.values()].sort((a, b) => a.category.localeCompare(b.category) || a.currency.localeCompare(b.currency)),
    byAccount: [...byAccountKey.values()].sort((a, b) => a.name.localeCompare(b.name)),
    netByCurrency: [...netByCurrencyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => ({ currency, amount })),
  };
}

function categorize(movement: { settlementId: string | null; expenseSettlementId: string | null; supplierPaymentId: string | null; cardStatementPaymentId: string | null; employeeAdvanceMovementId: string | null; loanDrawdownId: string | null; loanRepaymentId: string | null }): CashFlowCategory {
  if (movement.settlementId) return "customer_collection";
  if (movement.expenseSettlementId) return "expense_settlement";
  if (movement.supplierPaymentId) return "supplier_payment";
  if (movement.cardStatementPaymentId) return "card_statement_payment";
  if (movement.employeeAdvanceMovementId) return "employee_advance";
  if (movement.loanDrawdownId) return "loan_drawdown";
  if (movement.loanRepaymentId) return "loan_repayment";
  // Structurally unreachable — every FinancialAccountMovement row is created
  // by exactly one of the seven canonical write paths above, each of which
  // sets its own typed FK. Fails loud rather than silently mis-categorizing.
  throw new Error("FinancialAccountMovement row has no recognized source FK set.");
}

/**
 * §Actual vs Forecast — the two halves are structurally non-overlapping, not
 * merely reconciled after the fact: `actualToDate` sums only movements that
 * have ALREADY happened (real FinancialAccountMovement rows), and
 * `forecastRemaining` (via computeForecastCashFlow) sums only the REMAINING
 * (already-paid-amount-subtracted) balance of still-open obligations. An
 * obligation that later settles simply stops appearing in the forecast on
 * the next call — it does not get double-subtracted or require any
 * reconciliation step here.
 */
export async function computeActualVsForecast(organizationId: string, asOf: Date = new Date(), horizonDays = 90): Promise<ActualVsForecast> {
  const [actualMovements, forecast] = await Promise.all([
    prisma.financialAccountMovement.groupBy({ by: ["currency", "direction"], where: { organizationId, occurredAt: { lte: asOf } }, _sum: { amount: true } }),
    computeForecastCashFlow(organizationId, asOf, horizonDays),
  ]);

  const actualByCurrency = new Map<string, { inflow: number; outflow: number }>();
  for (const row of actualMovements) {
    const entry = actualByCurrency.get(row.currency) ?? { inflow: 0, outflow: 0 };
    if (row.direction === "IN") entry.inflow += Number(row._sum.amount ?? 0);
    else entry.outflow += Number(row._sum.amount ?? 0);
    actualByCurrency.set(row.currency, entry);
  }

  const forecastByCurrency = new Map<string, { inflow: number; outflow: number }>();
  for (const total of forecast.totals) {
    const entry = forecastByCurrency.get(total.currency) ?? { inflow: 0, outflow: 0 };
    if (total.direction === "RECEIVABLE") entry.inflow += total.amount;
    else entry.outflow += total.amount;
    forecastByCurrency.set(total.currency, entry);
  }

  return {
    asOf: asOf.toISOString(),
    actualToDate: [...actualByCurrency.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, v]) => ({ currency, inflow: v.inflow, outflow: v.outflow, net: v.inflow - v.outflow })),
    forecastRemaining: [...forecastByCurrency.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, v]) => ({ currency, inflow: v.inflow, outflow: v.outflow, net: v.inflow - v.outflow })),
  };
}
