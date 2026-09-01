import { prisma } from "@/lib/core/shared/prisma";
import { computeFinancialObligationProjections } from "@/lib/core/calendar/calendar-financial-projection.service";
import { addDaysToDateString, dateStringInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/core/calendar/calendar-timezone";
import { sumNetAllocationsForObligation } from "@/lib/core/financial-instruments/financial-instrument.repository";

export type PayableAgingBucket = "NOT_YET_DUE" | "DUE_TODAY" | "OVERDUE_1_30" | "OVERDUE_31_60" | "OVERDUE_61_90" | "OVERDUE_90_PLUS";
export type CurrentPayableItem = Readonly<{ id: string; counterpartyId: string | null; counterpartyName: string; currency: string; originalAmount: number; outstandingAmount: number; dueDate: string; daysOverdue: number; currentStatus: string; agingBucket: PayableAgingBucket }>;
export type CurrentPayableCurrency = Readonly<{ currency: string; totalOutstanding: number; overdueOutstanding: number; dueToday: number; notYetDue: number; dueNext7Days: number; dueNext14Days: number; dueNext30Days: number; obligationCount: number; overdueObligationCount: number; aging: Readonly<Record<PayableAgingBucket, number>>; items: readonly CurrentPayableItem[]; counterparties: readonly Readonly<{ counterpartyId: string | null; counterpartyName: string; totalOutstanding: number; overdueOutstanding: number; dueToday: number; notYetDue: number; oldestOverdueDays: number; overdueObligationCount: number }>[] }>;
export type CurrentPayableDataset = Readonly<{ asOf: string; timeZone: string; today: string; currencies: readonly CurrentPayableCurrency[] }>;
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const ordinal = (s: string) => { const [y,m,d] = s.split("-").map(Number); return Math.floor(Date.UTC(y,m-1,d)/86_400_000); };

export async function buildCurrentPayableDataset(organizationId: string, input: { now?: Date; timeZone?: string } = {}): Promise<CurrentPayableDataset> {
  const now = input.now ?? new Date(); const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE; const today = dateStringInTimeZone(now, timeZone);
  const projected = await computeFinancialObligationProjections({ organizationId, timeZone, now });
  const rows: CurrentPayableItem[] = [];
  for (const item of projected.filter((row) => row.direction === "PAYABLE")) {
    const coverage = item.id.startsWith("obligation:") ? await sumNetAllocationsForObligation(item.id.slice(11), organizationId, prisma) : 0;
    const outstandingAmount = round(Math.max(item.amount - coverage, 0)); if (outstandingAmount <= 0) continue;
    const due = dateStringInTimeZone(new Date(item.dueDate), timeZone); const daysOverdue = Math.max(0, ordinal(today)-ordinal(due));
    const agingBucket: PayableAgingBucket = due > today ? "NOT_YET_DUE" : due === today ? "DUE_TODAY" : daysOverdue <= 30 ? "OVERDUE_1_30" : daysOverdue <= 60 ? "OVERDUE_31_60" : daysOverdue <= 90 ? "OVERDUE_61_90" : "OVERDUE_90_PLUS";
    rows.push(Object.freeze({ id:item.id, counterpartyId:item.counterpartyId ?? null, counterpartyName:item.counterpartyName ?? "Karşı taraf belirtilmemiş", currency:item.currency, originalAmount:round(item.originalAmount ?? item.amount), outstandingAmount, dueDate:item.dueDate, daysOverdue, currentStatus:item.currentStatus ?? item.status, agingBucket }));
  }
  const currencies = [...new Set(rows.map(r=>r.currency))].sort().map((currency): CurrentPayableCurrency => {
    const items=rows.filter(r=>r.currency===currency); const sum=(xs:CurrentPayableItem[])=>round(xs.reduce((a,r)=>a+r.outstandingAmount,0));
    const dueWithin=(days:number)=>sum(items.filter(r=>{const due=dateStringInTimeZone(new Date(r.dueDate),timeZone);return due>=addDaysToDateString(today,1)&&due<addDaysToDateString(today,days+1);}));
    const aging=Object.freeze({NOT_YET_DUE:sum(items.filter(r=>r.agingBucket==="NOT_YET_DUE")),DUE_TODAY:sum(items.filter(r=>r.agingBucket==="DUE_TODAY")),OVERDUE_1_30:sum(items.filter(r=>r.agingBucket==="OVERDUE_1_30")),OVERDUE_31_60:sum(items.filter(r=>r.agingBucket==="OVERDUE_31_60")),OVERDUE_61_90:sum(items.filter(r=>r.agingBucket==="OVERDUE_61_90")),OVERDUE_90_PLUS:sum(items.filter(r=>r.agingBucket==="OVERDUE_90_PLUS"))});
    const map=new Map<string,CurrentPayableItem[]>(); for(const r of items){const k=r.counterpartyId??`name:${r.counterpartyName}`;map.set(k,[...(map.get(k)??[]),r]);}
    const counterparties=[...map.entries()].map(([k,x])=>({counterpartyId:k.startsWith("name:")?null:k,counterpartyName:x[0].counterpartyName,totalOutstanding:sum(x),overdueOutstanding:sum(x.filter(r=>r.daysOverdue>0)),dueToday:sum(x.filter(r=>r.agingBucket==="DUE_TODAY")),notYetDue:sum(x.filter(r=>r.agingBucket==="NOT_YET_DUE")),oldestOverdueDays:Math.max(0,...x.map(r=>r.daysOverdue)),overdueObligationCount:x.filter(r=>r.daysOverdue>0).length})).sort((a,b)=>b.overdueOutstanding-a.overdueOutstanding||a.counterpartyName.localeCompare(b.counterpartyName));
    return Object.freeze({currency,totalOutstanding:sum(items),overdueOutstanding:sum(items.filter(r=>r.daysOverdue>0)),dueToday:aging.DUE_TODAY,notYetDue:aging.NOT_YET_DUE,dueNext7Days:dueWithin(7),dueNext14Days:dueWithin(14),dueNext30Days:dueWithin(30),obligationCount:items.length,overdueObligationCount:items.filter(r=>r.daysOverdue>0).length,aging,items:Object.freeze([...items].sort((a,b)=>b.outstandingAmount-a.outstandingAmount)),counterparties:Object.freeze(counterparties)});
  });
  return Object.freeze({asOf:now.toISOString(),timeZone,today,currencies:Object.freeze(currencies)});
}
