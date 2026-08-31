import { prisma } from "@/lib/core/shared/prisma";
import { computeFinancialObligationProjections } from "@/lib/core/calendar/calendar-financial-projection.service";
import { DEFAULT_TIME_ZONE } from "@/lib/core/calendar/calendar-timezone";
import { sumNetAllocationsForObligation } from "@/lib/core/financial-instruments/financial-instrument.repository";
import type { ForecastCashFlow, ForecastCashFlowTotal } from "./financial-reporting.types";

/**
 * §Forecast Cash Flow — derives ONLY from Phase 12's canonical projection
 * (`computeFinancialObligationProjections`), which itself derives ONLY from
 * `ObligationScheduleLine`/`FinancialInstrument` remaining balances — never
 * from Payment/Expense.status caches, never from quote-pipeline heuristics.
 * Already-settled amounts never enter this at all (the projection excludes
 * them by construction — see its own header comment); a partial settlement
 * means only the true remaining amount appears here, a reversal means the
 * reopened amount reappears on the next call, a cancelled source never
 * appears.
 *
 * §Instrument allocation ≠ double count — an obligation with an ACTIVE
 * (registered/allocated, not yet cleared) instrument against it appears
 * TWICE in `items` (once as the commercial obligation, once as the
 * instrument's own maturity — both real, distinct, individually useful
 * facts, exactly as Calendar shows them). But `totals` — the aggregate
 * "how much do we actually still expect" figure — nets the obligation's
 * contribution down by its own `sumNetAllocationsForObligation` (Phase 10's
 * existing, already-tested ceiling function) so the SAME expected cash is
 * never summed twice just because it currently has an uncleared instrument
 * sitting against it. Once an instrument actually clears, its allocation's
 * `settledReferenceId` gets set and `sumNetAllocationsForObligation`
 * (which excludes cleared allocations by construction — see that
 * function's own doc comment) naturally stops netting it — the obligation
 * itself has by then already dropped out of the projection entirely
 * (real cash moved, remaining hit zero).
 *
 * No `dueDateFrom` lower bound — an obligation that became overdue long ago
 * is still a real expected (if late) future cash movement and belongs in
 * the forecast, exactly as the Phase 12 notification scheduler already
 * treats it.
 */
export async function computeForecastCashFlow(organizationId: string, asOf: Date = new Date(), horizonDays = 90, timeZone: string = DEFAULT_TIME_ZONE): Promise<ForecastCashFlow> {
  const horizonEnd = new Date(asOf.getTime() + horizonDays * 86_400_000);

  const items = await computeFinancialObligationProjections({ organizationId, dueDateTo: horizonEnd, timeZone, now: asOf });

  const totalsMap = new Map<string, ForecastCashFlowTotal>();
  for (const item of items) {
    const contribution = await totalsContribution(organizationId, item);
    if (contribution <= 0) continue;
    const key = `${item.direction}:${item.currency}`;
    const existing = totalsMap.get(key);
    totalsMap.set(key, { direction: item.direction, currency: item.currency, amount: (existing?.amount ?? 0) + contribution });
  }

  return {
    asOf: asOf.toISOString(),
    horizonEnd: horizonEnd.toISOString(),
    totals: [...totalsMap.values()].sort((a, b) => a.direction.localeCompare(b.direction) || a.currency.localeCompare(b.currency)),
    items: items.map((item) => ({ id: item.id, title: item.title, dueDate: item.dueDate, direction: item.direction, status: item.status, amount: item.amount, currency: item.currency })),
  };
}

async function totalsContribution(organizationId: string, item: { id: string; amount: number }): Promise<number> {
  if (!item.id.startsWith("obligation:")) return item.amount; // instrument:* items always contribute their own face value
  const lineId = item.id.slice("obligation:".length);
  const netUnclearedInstrumentCoverage = await sumNetAllocationsForObligation(lineId, organizationId, prisma);
  return Math.max(item.amount - netUnclearedInstrumentCoverage, 0);
}
