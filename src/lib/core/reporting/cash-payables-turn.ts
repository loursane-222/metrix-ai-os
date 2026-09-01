import type { ManagementIntent } from "@/lib/conversation-understanding";
import type { CashFlowDataset, CashPositionDataset } from "./cash-management-intelligence.service";
import type { CurrentPayableCurrency, CurrentPayableDataset } from "./current-payable-intelligence.service";

export type CashPayablesTurnFact = Readonly<{ intent: ManagementIntent; cashPosition?: CashPositionDataset; cashFlow?: CashFlowDataset; payables?: CurrentPayableDataset }>;
const money=(n:number,c:string)=>`${new Intl.NumberFormat("tr-TR",{maximumFractionDigits:2}).format(n)} ${c}`;
export function buildCashPayablesResponse(fact:CashPayablesTurnFact):string {
  if(fact.intent.intent==="CASH_POSITION"){
    if(!fact.cashPosition?.accounts.length)return "Gerçek nakit pozisyonunu hesaplayacak bağlı finansal hesap bulunmuyor.";
    return `${fact.cashPosition.totalsByCurrency.map(t=>`${t.currency} tarafında gerçek nakit pozisyonu ${money(t.amount,t.currency)}`).join("; ")}.`;
  }
  if(fact.intent.intent==="CASH_FLOW"){
    const d=fact.cashFlow!; if(!d.currencies.length)return `${d.period.label} döneminde gerçekleşmiş nakit hareketi bulunmuyor.`;
    return `${d.period.kind==="CURRENT_MONTH"?`${d.period.label} ayının şu ana kadarki bölümünde`:d.period.label} ${d.currencies.map(c=>fact.intent.intent==="CASH_FLOW"&&fact.intent.queryMode==="INFLOW"?`${money(c.inflow,c.currency)} gerçek nakit girişi`:fact.intent.intent==="CASH_FLOW"&&fact.intent.queryMode==="OUTFLOW"?`${money(c.outflow,c.currency)} gerçek nakit çıkışı`:fact.intent.intent==="CASH_FLOW"&&fact.intent.queryMode==="NET"?`net gerçek nakit hareketi ${c.net>=0?"+":""}${money(c.net,c.currency)}`:`${money(c.inflow,c.currency)} giriş, ${money(c.outflow,c.currency)} çıkış; net ${c.net>=0?"+":""}${money(c.net,c.currency)}`).join("; ")}.`;
  }
  const intent=fact.intent as Extract<ManagementIntent,{intent:"PAYABLE_POSITION"}>;
  if(intent.queryMode==="HISTORICAL_UNSUPPORTED")return "Geçmiş dönem borç yaşlandırmasını güvenle kuracak kanonik tarihsel snapshot bulunmuyor; bugünkü durumu geçmiş dönem gerçeği gibi sunmayacağım.";
  const d=fact.payables; if(!d?.currencies.length)return intent.queryMode==="OVERDUE"||intent.queryMode==="OVERDUE_90_PLUS"||intent.queryMode==="LARGEST_OVERDUE"||intent.queryMode==="COUNTERPARTY_OVERDUE_RANKING"?"Şu anda vadesi geçmiş açık borç bulunmuyor.":"Şu anda açık borç bulunmuyor.";
  return `${d.currencies.map(c=>payableLine(intent.queryMode,c)).join("; ")}.`;
}
function payableLine(mode:Extract<ManagementIntent,{intent:"PAYABLE_POSITION"}>["queryMode"],c:CurrentPayableCurrency){
  if(mode==="TOTAL")return `${c.currency} tarafında ${money(c.totalOutstanding,c.currency)} açık borç var; ${money(c.overdueOutstanding,c.currency)} vadesi geçmiş, ${money(c.dueToday,c.currency)} bugün vadeli`;
  if(mode==="OVERDUE")return c.overdueOutstanding?`${c.currency} tarafında ${money(c.overdueOutstanding,c.currency)} vadesi geçmiş açık borç var`:`${c.currency} tarafında vadesi geçmiş açık borç yok`;
  if(mode==="DUE_TODAY")return `${c.currency} tarafında bugün vadesi gelen açık borç ${money(c.dueToday,c.currency)}`;
  if(mode.startsWith("DUE_NEXT_")){const n=Number(mode.match(/\d+/)?.[0]);const v=n===7?c.dueNext7Days:n===14?c.dueNext14Days:c.dueNext30Days;return `${c.currency} tarafında önümüzdeki ${n} takvim gününde vadesi gelecek planlanmış ödeme yükümlülüğü ${money(v,c.currency)}`;}
  if(mode==="AGING")return `${c.currency}: henüz vadeli ${money(c.aging.NOT_YET_DUE,c.currency)}, bugün vadeli ${money(c.aging.DUE_TODAY,c.currency)}, 1–30 gün ${money(c.aging.OVERDUE_1_30,c.currency)}, 31–60 gün ${money(c.aging.OVERDUE_31_60,c.currency)}, 61–90 gün ${money(c.aging.OVERDUE_61_90,c.currency)}, 90 günden uzun ${money(c.aging.OVERDUE_90_PLUS,c.currency)}`;
  if(mode==="OVERDUE_90_PLUS")return `${c.currency} tarafında 90 günden uzun gecikmiş açık borç ${money(c.aging.OVERDUE_90_PLUS,c.currency)}`;
  if(mode==="LARGEST_OVERDUE"){const x=c.items.filter(i=>i.daysOverdue>0).slice(0,5);return x.length?`${c.currency}: ${x.map(i=>`${i.counterpartyName} ${money(i.outstandingAmount,c.currency)} (${i.daysOverdue} gün)`).join(", ")}`:`${c.currency} tarafında vadesi geçmiş açık borç yok`;}
  const x=c.counterparties.filter(i=>i.overdueOutstanding>0).slice(0,5);return x.length?`${c.currency}: ${x.map(i=>`${i.counterpartyName} ${money(i.overdueOutstanding,c.currency)} (en eski ${i.oldestOverdueDays} gün)`).join(", ")}`:`${c.currency} tarafında vadesi geçmiş açık borç yok`;
}
