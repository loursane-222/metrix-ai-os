import type { ManagementIntent } from "@/lib/conversation-understanding";
import type { CurrentReceivableDataset, CurrentReceivableCurrency } from "./current-receivable-intelligence.service";

export type CurrentReceivableTurnFact = Readonly<{ queryMode: Extract<ManagementIntent, { intent: "RECEIVABLE_POSITION" }>["queryMode"]; dataset: CurrentReceivableDataset | null; supported: boolean }>;
const money = (value: number, currency: string) => `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
const join = (lines: string[]) => lines.join("; ");

export function projectCurrentReceivableTurnFact(intent: ManagementIntent | null | undefined, dataset: CurrentReceivableDataset | null): CurrentReceivableTurnFact | null {
  if (intent?.intent !== "RECEIVABLE_POSITION") return null;
  const supported = intent.queryMode !== "HISTORICAL_UNSUPPORTED" && intent.queryMode !== "DSO_UNSUPPORTED";
  return Object.freeze({ queryMode: intent.queryMode, dataset: supported ? dataset : null, supported });
}

function currencyLine(mode: CurrentReceivableTurnFact["queryMode"], item: CurrentReceivableCurrency): string {
  if (mode === "TOTAL") return `${item.currency} tarafında ${money(item.totalOutstanding, item.currency)} açık alacak var; ${money(item.overdueOutstanding, item.currency)} vadesi geçmiş, ${money(item.dueToday, item.currency)} bugün vadeli`;
  if (mode === "OVERDUE") return item.overdueOutstanding === 0 ? `${item.currency} tarafında vadesi geçmiş açık alacak yok` : `${item.currency} tarafında ${money(item.overdueOutstanding, item.currency)} vadesi geçmiş açık alacak var`;
  if (mode === "DUE_TODAY") return `${item.currency} tarafında bugün vadesi gelen açık alacak ${money(item.dueToday, item.currency)}`;
  if (mode.startsWith("DUE_NEXT_")) { const days = Number(mode.match(/\d+/)?.[0]); const value = days === 7 ? item.dueNext7Days : days === 14 ? item.dueNext14Days : item.dueNext30Days; return `${item.currency} tarafında önümüzdeki ${days} takvim gününde vadesi gelecek açık alacak ${money(value, item.currency)}`; }
  if (mode === "OVERDUE_90_PLUS") return `${item.currency} tarafında 90 günden uzun süredir gecikmiş açık alacak ${money(item.aging.OVERDUE_90_PLUS, item.currency)}`;
  if (mode === "AGING") return `${item.currency}: henüz vadeli ${money(item.aging.NOT_YET_DUE, item.currency)}, bugün vadeli ${money(item.aging.DUE_TODAY, item.currency)}, 1–30 gün ${money(item.aging.OVERDUE_1_30, item.currency)}, 31–60 gün ${money(item.aging.OVERDUE_31_60, item.currency)}, 61–90 gün ${money(item.aging.OVERDUE_61_90, item.currency)}, 90 günden uzun ${money(item.aging.OVERDUE_90_PLUS, item.currency)}`;
  if (mode === "LARGEST_OVERDUE") { const rows = item.items.filter((row) => row.daysOverdue > 0).slice(0, 5); return rows.length ? `${item.currency}: ${rows.map((row) => `${row.customerName} ${money(row.outstandingAmount, row.currency)} (${row.daysOverdue} gün)`).join(", ")}` : `${item.currency} tarafında vadesi geçmiş açık alacak yok`; }
  if (mode === "CUSTOMER_OVERDUE_RANKING") { const rows = item.customers.filter((row) => row.overdueOutstanding > 0).slice(0, 5); return rows.length ? `${item.currency}: ${rows.map((row) => `${row.customerName} ${money(row.overdueOutstanding, item.currency)} (en eski ${row.oldestOverdueDays} gün)`).join(", ")}` : `${item.currency} tarafında vadesi geçmiş açık alacak yok`; }
  return "";
}

export function buildCurrentReceivableResponse(fact: CurrentReceivableTurnFact): string {
  if (fact.queryMode === "HISTORICAL_UNSUPPORTED") return "Geçmiş dönem alacak yaşlandırmasını güvenle yeniden kuracak kanonik bir tarihsel snapshot bulunmuyor; bugünkü durumu geçmiş dönem gerçeği gibi sunmayacağım.";
  if (fact.queryMode === "DSO_UNSUPPORTED") return "DSO için kabul edilmiş tarihsel alacak ve gelir dönemi otoritesi bulunmuyor; doğrulanmamış bir DSO hesaplamayacağım.";
  if (!fact.dataset) return "Güncel açık alacak gerçeğini doğrulayamadım.";
  if (fact.dataset.currencies.length === 0) return fact.queryMode === "OVERDUE" || fact.queryMode === "OVERDUE_90_PLUS" || fact.queryMode === "LARGEST_OVERDUE" || fact.queryMode === "CUSTOMER_OVERDUE_RANKING" ? "Şu anda vadesi geçmiş açık alacak bulunmuyor." : "Şu anda açık alacak bulunmuyor.";
  return `${join(fact.dataset.currencies.map((item) => currencyLine(fact.queryMode, item)))}.`;
}
