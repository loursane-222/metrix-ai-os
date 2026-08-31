import { prisma } from "@/lib/core/shared/prisma";
import type { ActualCashPosition, CashPositionAccountEntry } from "./financial-reporting.types";

/**
 * §Actual Cash Position — the ONLY canonical source is `FinancialAccountMovement`
 * (every real cash in/out event across Settlement/ExpenseSettlement/
 * SupplierPayment/CardStatementPayment/EmployeeAdvanceMovement/LoanDrawdown/
 * LoanRepayment creates exactly one row there, by Phase 3-11 construction —
 * a single `groupBy` therefore covers every money-movement family without
 * per-domain logic). `FinancialAccount` itself carries NO mutable balance
 * column (see its own schema comment) and this function never introduces
 * one — balance is always re-derived from movements, live, on every call.
 *
 * `asOf` makes this a point-in-time balance (movements after `asOf` are
 * excluded), so it doubles as the historical cash-position query the audit
 * asked about — pass a past date to see the balance as of that moment.
 *
 * Currencies are never blended: `totalsByCurrency` sums same-currency
 * accounts only. No FX conversion is invented anywhere in this module.
 */
export async function computeActualCashPosition(organizationId: string, asOf: Date = new Date()): Promise<ActualCashPosition> {
  const [accounts, movementSums] = await Promise.all([
    prisma.financialAccount.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
    prisma.financialAccountMovement.groupBy({
      by: ["financialAccountId", "direction"],
      where: { organizationId, occurredAt: { lte: asOf } },
      _sum: { amount: true },
    }),
  ]);

  const sumsByAccount = new Map<string, { in: number; out: number }>();
  for (const row of movementSums) {
    const entry = sumsByAccount.get(row.financialAccountId) ?? { in: 0, out: 0 };
    if (row.direction === "IN") entry.in += Number(row._sum.amount ?? 0);
    else entry.out += Number(row._sum.amount ?? 0);
    sumsByAccount.set(row.financialAccountId, entry);
  }

  const accountEntries: CashPositionAccountEntry[] = accounts.map((account) => {
    const sums = sumsByAccount.get(account.id) ?? { in: 0, out: 0 };
    return { financialAccountId: account.id, name: account.name, type: account.type, currency: account.currency, balance: sums.in - sums.out };
  });

  const totalsByCurrency = new Map<string, number>();
  for (const entry of accountEntries) totalsByCurrency.set(entry.currency, (totalsByCurrency.get(entry.currency) ?? 0) + entry.balance);

  return {
    asOf: asOf.toISOString(),
    accounts: accountEntries,
    totalsByCurrency: [...totalsByCurrency.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => ({ currency, amount })),
  };
}
