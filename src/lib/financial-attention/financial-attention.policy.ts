import type { CashPositionDataset } from "@/lib/core/reporting/cash-management-intelligence.service";
import type { CurrentPayableDataset } from "@/lib/core/reporting/current-payable-intelligence.service";
import type { CurrentReceivableDataset } from "@/lib/core/reporting/current-receivable-intelligence.service";
import type { CollectionPerformanceTurnFact } from "@/lib/domain-evidence/collection-performance-turn";

export type FinancialAttentionReasonCode =
  | "RECEIVABLE_OVER_90_DAYS"
  | "PAYABLE_OVER_90_DAYS"
  | "COLLECTION_REVERSAL_ACTIVITY"
  | "CASH_POSITION_UNAVAILABLE";

export type FinancialAttentionItem = Readonly<{
  id: string;
  kind: "BUSINESS_FACT" | "INFORMATION_GAP";
  reasonCode: FinancialAttentionReasonCode;
  evidenceSource: "CURRENT_RECEIVABLE_DATASET" | "CURRENT_PAYABLE_DATASET" | "COLLECTIONS_MANAGEMENT_SUMMARY" | "ACTUAL_CASH_POSITION";
  order: number;
  currency?: string;
  amount?: number;
  count?: number;
  periodLabel?: string;
}>;

export type FinancialAttentionDataset = Readonly<{
  asOf: string;
  timeZone: string;
  evaluatedDimensions: readonly ("RECEIVABLE_AGING" | "PAYABLE_AGING" | "COLLECTION_REVERSALS" | "CASH_AVAILABILITY")[];
  items: readonly FinancialAttentionItem[];
}>;

export type FinancialAttentionPolicyInput = Readonly<{
  receivables: CurrentReceivableDataset;
  payables: CurrentPayableDataset;
  cashPosition: CashPositionDataset;
  currentCollections: CollectionPerformanceTurnFact;
}>;

const money = (value: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);

export function evaluateFinancialAttention(input: FinancialAttentionPolicyInput): FinancialAttentionDataset {
  const items: FinancialAttentionItem[] = [];
  for (const row of [...input.receivables.currencies].sort((a, b) => a.currency.localeCompare(b.currency))) {
    const amount = row.aging.OVERDUE_90_PLUS;
    if (amount > 0) items.push(Object.freeze({ id: `receivable-over-90:${row.currency}`, kind: "BUSINESS_FACT", reasonCode: "RECEIVABLE_OVER_90_DAYS", evidenceSource: "CURRENT_RECEIVABLE_DATASET", order: 10, currency: row.currency, amount }));
  }
  for (const row of [...input.payables.currencies].sort((a, b) => a.currency.localeCompare(b.currency))) {
    const amount = row.aging.OVERDUE_90_PLUS;
    if (amount > 0) items.push(Object.freeze({ id: `payable-over-90:${row.currency}`, kind: "BUSINESS_FACT", reasonCode: "PAYABLE_OVER_90_DAYS", evidenceSource: "CURRENT_PAYABLE_DATASET", order: 20, currency: row.currency, amount }));
  }
  for (const row of [...input.currentCollections.currencies].sort((a, b) => a.currency.localeCompare(b.currency))) {
    const reversedAmount = Math.abs(row.reversals);
    if (reversedAmount > 0) items.push(Object.freeze({ id: `collection-reversal:${row.currency}`, kind: "BUSINESS_FACT", reasonCode: "COLLECTION_REVERSAL_ACTIVITY", evidenceSource: "COLLECTIONS_MANAGEMENT_SUMMARY", order: 30, currency: row.currency, amount: reversedAmount, periodLabel: input.currentCollections.label }));
  }
  if (input.cashPosition.accounts.length === 0) items.push(Object.freeze({ id: "cash-position-unavailable", kind: "INFORMATION_GAP", reasonCode: "CASH_POSITION_UNAVAILABLE", evidenceSource: "ACTUAL_CASH_POSITION", order: 40 }));
  items.sort((a, b) => a.order - b.order || (a.currency ?? "").localeCompare(b.currency ?? "") || a.id.localeCompare(b.id));
  return Object.freeze({ asOf: input.receivables.asOf, timeZone: input.receivables.timeZone, evaluatedDimensions: Object.freeze(["RECEIVABLE_AGING", "PAYABLE_AGING", "COLLECTION_REVERSALS", "CASH_AVAILABILITY"] as const), items: Object.freeze(items) });
}

export function buildFinancialAttentionResponse(dataset: FinancialAttentionDataset): string {
  const facts = dataset.items.filter((item) => item.kind === "BUSINESS_FACT");
  const gaps = dataset.items.filter((item) => item.kind === "INFORMATION_GAP");
  const sentences: string[] = [];
  if (facts.length === 0) {
    sentences.push("Mevcut alacak, borç ve tahsilat verilerinde tanımlı kurallara göre dikkat gerektiren bir durum görünmüyor.");
  } else {
    const details = facts.map((item) => {
      if (item.reasonCode === "RECEIVABLE_OVER_90_DAYS") return `90 günden uzun süredir gecikmiş ${money(item.amount!)} ${item.currency} açık alacak`;
      if (item.reasonCode === "PAYABLE_OVER_90_DAYS") return `90 günden uzun süredir gecikmiş ${money(item.amount!)} ${item.currency} açık borç`;
      return `${item.periodLabel} döneminde ${money(item.amount!)} ${item.currency} tahsilat ters kaydı`;
    });
    sentences.push(`Finans tarafında şu anda ${facts.length} konu dikkat gerektiriyor: ${details.join("; ")}.`);
  }
  if (gaps.some((item) => item.reasonCode === "CASH_POSITION_UNAVAILABLE")) sentences.push("Bağlı finansal hesap olmadığı için gerçek nakit pozisyonunu değerlendiremiyorum.");
  return sentences.join(" ");
}
