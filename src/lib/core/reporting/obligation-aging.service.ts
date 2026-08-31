import { prisma } from "@/lib/core/shared/prisma";
import { computeFinancialObligationProjections } from "@/lib/core/calendar/calendar-financial-projection.service";
import { DEFAULT_TIME_ZONE, type FinancialDueStatus } from "@/lib/core/calendar/calendar-timezone";
import { sumNetAllocationsForObligation } from "@/lib/core/financial-instruments/financial-instrument.repository";
import type { AgingBucket, AgingBucketTotal, AgingItem, AgingReport } from "./financial-reporting.types";

const FAR_FUTURE_HORIZON_DAYS = 730;

/**
 * §Receivable/Payable Aging — canonical `ObligationScheduleLine` only, via
 * the same Phase 12 projection used by Calendar/forecast (never a second
 * aging-specific query). Bucketing reuses `classifyFinancialDueStatus`
 * (Phase 12's own timezone-correct day-boundary helper) — UPCOMING/FUTURE
 * both fold into NOT_YET_DUE here since Phase 13's aging buckets are
 * coarser than the calendar's own upcoming/future split. A partial
 * settlement is already netted into `amount` by the projection layer
 * itself, so no separate netting step is needed here.
 *
 * `items[].amount` always shows the raw commercial remaining balance (for
 * drill-down/traceability, matching what Calendar itself shows); an
 * obligation with an active uncleared instrument against it still nets its
 * `totalsByBucket` contribution down by that instrument's coverage — see
 * forecast-cash-flow.service.ts's identical, more-commented treatment of
 * the exact same "instrument allocation ≠ double count" invariant.
 */
export async function computeAgingReport(organizationId: string, direction: "RECEIVABLE" | "PAYABLE", asOf: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): Promise<AgingReport> {
  const horizonEnd = new Date(asOf.getTime() + FAR_FUTURE_HORIZON_DAYS * 86_400_000);
  const projected = await computeFinancialObligationProjections({ organizationId, dueDateTo: horizonEnd, timeZone, now: asOf });

  const items: AgingItem[] = projected
    .filter((item) => item.direction === direction)
    .map((item) => ({ id: item.id, title: item.title, dueDate: item.dueDate, bucket: toBucket(item.status), amount: item.amount, currency: item.currency }));

  const totalsMap = new Map<string, number>();
  for (const item of items) {
    const contribution = await totalsContribution(organizationId, item);
    if (contribution <= 0) continue;
    const key = `${item.bucket}:${item.currency}`;
    totalsMap.set(key, (totalsMap.get(key) ?? 0) + contribution);
  }
  const totalsByBucket: AgingBucketTotal[] = [...totalsMap.entries()]
    .map(([key, amount]) => {
      const [bucket, currency] = key.split(":") as [AgingBucket, string];
      return { bucket, currency, amount };
    })
    .sort((a, b) => a.bucket.localeCompare(b.bucket) || a.currency.localeCompare(b.currency));

  return { asOf: asOf.toISOString(), direction, items, totalsByBucket };
}

export function computeReceivableAging(organizationId: string, asOf?: Date, timeZone?: string) {
  return computeAgingReport(organizationId, "RECEIVABLE", asOf, timeZone);
}

export function computePayableAging(organizationId: string, asOf?: Date, timeZone?: string) {
  return computeAgingReport(organizationId, "PAYABLE", asOf, timeZone);
}

function toBucket(status: FinancialDueStatus): AgingBucket {
  if (status === "OVERDUE") return "OVERDUE";
  if (status === "DUE_TODAY") return "DUE_TODAY";
  return "NOT_YET_DUE";
}

async function totalsContribution(organizationId: string, item: { id: string; amount: number }): Promise<number> {
  if (!item.id.startsWith("obligation:")) return item.amount;
  const lineId = item.id.slice("obligation:".length);
  const netUnclearedInstrumentCoverage = await sumNetAllocationsForObligation(lineId, organizationId, prisma);
  return Math.max(item.amount - netUnclearedInstrumentCoverage, 0);
}
