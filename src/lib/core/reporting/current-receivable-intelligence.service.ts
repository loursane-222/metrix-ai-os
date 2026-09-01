import { prisma } from "@/lib/core/shared/prisma";
import { computeFinancialObligationProjections } from "@/lib/core/calendar/calendar-financial-projection.service";
import { addDaysToDateString, dateStringInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/core/calendar/calendar-timezone";
import { sumNetAllocationsForObligation } from "@/lib/core/financial-instruments/financial-instrument.repository";

export type ReceivableAgingBucket = "NOT_YET_DUE" | "DUE_TODAY" | "OVERDUE_1_30" | "OVERDUE_31_60" | "OVERDUE_61_90" | "OVERDUE_90_PLUS";
export type CurrentReceivableItem = Readonly<{ id: string; customerId: string | null; customerName: string; currency: string; originalAmount: number; outstandingAmount: number; dueDate: string; daysOverdue: number; currentStatus: string; agingBucket: ReceivableAgingBucket }>;
export type CurrentReceivableCurrency = Readonly<{ currency: string; totalOutstanding: number; overdueOutstanding: number; dueToday: number; notYetDue: number; dueNext7Days: number; dueNext14Days: number; dueNext30Days: number; obligationCount: number; overdueObligationCount: number; aging: Readonly<Record<ReceivableAgingBucket, number>>; items: readonly CurrentReceivableItem[]; customers: readonly Readonly<{ customerId: string | null; customerName: string; totalOutstanding: number; overdueOutstanding: number; dueToday: number; notYetDue: number; oldestOverdueDays: number; overdueObligationCount: number }>[] }>;
export type CurrentReceivableDataset = Readonly<{ asOf: string; timeZone: string; today: string; currencies: readonly CurrentReceivableCurrency[] }>;

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const dayOrdinal = (value: string) => { const [y, m, d] = value.split("-").map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000); };

export async function buildCurrentReceivableDataset(organizationId: string, input: { now?: Date; timeZone?: string } = {}): Promise<CurrentReceivableDataset> {
  const now = input.now ?? new Date();
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const today = dateStringInTimeZone(now, timeZone);
  const projected = await computeFinancialObligationProjections({ organizationId, timeZone, now });
  const rows: CurrentReceivableItem[] = [];
  for (const item of projected.filter((entry) => entry.direction === "RECEIVABLE")) {
    const coverage = item.id.startsWith("obligation:") ? await sumNetAllocationsForObligation(item.id.slice("obligation:".length), organizationId, prisma) : 0;
    const outstandingAmount = roundMoney(Math.max(item.amount - coverage, 0));
    if (outstandingAmount <= 0) continue;
    const dueDay = dateStringInTimeZone(new Date(item.dueDate), timeZone);
    const daysOverdue = Math.max(0, dayOrdinal(today) - dayOrdinal(dueDay));
    const agingBucket: ReceivableAgingBucket = dueDay > today ? "NOT_YET_DUE" : dueDay === today ? "DUE_TODAY" : daysOverdue <= 30 ? "OVERDUE_1_30" : daysOverdue <= 60 ? "OVERDUE_31_60" : daysOverdue <= 90 ? "OVERDUE_61_90" : "OVERDUE_90_PLUS";
    rows.push(Object.freeze({ id: item.id, customerId: item.customerId ?? null, customerName: item.customerName ?? "Müşterisi belirtilmemiş", currency: item.currency, originalAmount: roundMoney(item.originalAmount ?? item.amount), outstandingAmount, dueDate: item.dueDate, daysOverdue, currentStatus: item.currentStatus ?? item.status, agingBucket }));
  }
  const currencies = [...new Set(rows.map((row) => row.currency))].sort().map((currency): CurrentReceivableCurrency => {
    const items = rows.filter((row) => row.currency === currency);
    const sum = (selected: CurrentReceivableItem[]) => roundMoney(selected.reduce((total, row) => total + row.outstandingAmount, 0));
    const dueWithin = (days: number) => sum(items.filter((row) => { const due = dateStringInTimeZone(new Date(row.dueDate), timeZone); return due >= addDaysToDateString(today, 1) && due < addDaysToDateString(today, days + 1); }));
    const aging = Object.freeze({ NOT_YET_DUE: sum(items.filter((r) => r.agingBucket === "NOT_YET_DUE")), DUE_TODAY: sum(items.filter((r) => r.agingBucket === "DUE_TODAY")), OVERDUE_1_30: sum(items.filter((r) => r.agingBucket === "OVERDUE_1_30")), OVERDUE_31_60: sum(items.filter((r) => r.agingBucket === "OVERDUE_31_60")), OVERDUE_61_90: sum(items.filter((r) => r.agingBucket === "OVERDUE_61_90")), OVERDUE_90_PLUS: sum(items.filter((r) => r.agingBucket === "OVERDUE_90_PLUS")) });
    const customerMap = new Map<string, CurrentReceivableItem[]>();
    for (const row of items) { const key = row.customerId ?? "__unknown__"; customerMap.set(key, [...(customerMap.get(key) ?? []), row]); }
    const customers = [...customerMap.entries()].map(([key, customerItems]) => ({ customerId: key === "__unknown__" ? null : key, customerName: customerItems[0].customerName, totalOutstanding: sum(customerItems), overdueOutstanding: sum(customerItems.filter((r) => r.daysOverdue > 0)), dueToday: sum(customerItems.filter((r) => r.agingBucket === "DUE_TODAY")), notYetDue: sum(customerItems.filter((r) => r.agingBucket === "NOT_YET_DUE")), oldestOverdueDays: Math.max(0, ...customerItems.map((r) => r.daysOverdue)), overdueObligationCount: customerItems.filter((r) => r.daysOverdue > 0).length })).sort((a, b) => b.overdueOutstanding - a.overdueOutstanding || a.customerName.localeCompare(b.customerName));
    return Object.freeze({ currency, totalOutstanding: sum(items), overdueOutstanding: sum(items.filter((r) => r.daysOverdue > 0)), dueToday: aging.DUE_TODAY, notYetDue: aging.NOT_YET_DUE, dueNext7Days: dueWithin(7), dueNext14Days: dueWithin(14), dueNext30Days: dueWithin(30), obligationCount: items.length, overdueObligationCount: items.filter((r) => r.daysOverdue > 0).length, aging, items: Object.freeze([...items].sort((a, b) => b.outstandingAmount - a.outstandingAmount)), customers: Object.freeze(customers) });
  });
  return Object.freeze({ asOf: now.toISOString(), timeZone, today, currencies: Object.freeze(currencies) });
}
