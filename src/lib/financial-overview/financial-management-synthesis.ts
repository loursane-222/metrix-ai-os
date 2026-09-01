import type { CashFlowDataset, CashPositionDataset } from "@/lib/core/reporting/cash-management-intelligence.service";
import type { CurrentPayableDataset } from "@/lib/core/reporting/current-payable-intelligence.service";
import type { CurrentReceivableDataset } from "@/lib/core/reporting/current-receivable-intelligence.service";
import type { CollectionPerformanceTurnFact } from "@/lib/domain-evidence/collection-performance-turn";
import type { FinancialAttentionDataset, FinancialAttentionItem } from "@/lib/financial-attention/financial-attention.policy";

export type FinancialManagementSynthesisDataset = Readonly<{
  asOf: string;
  timeZone: string;
  period: Readonly<{ kind: "CURRENT_MONTH"; label: string; start: string; endExclusive: string }>;
  evaluatedDimensions: readonly ("COLLECTIONS" | "RECEIVABLES" | "CASH_POSITION" | "ACTUAL_CASH_FLOW" | "PAYABLES" | "FINANCIAL_ATTENTION")[];
  unavailableDimensions: readonly "CASH_POSITION"[];
  currenciesPresent: readonly string[];
  collections: CollectionPerformanceTurnFact;
  receivables: CurrentReceivableDataset;
  cashPosition: CashPositionDataset;
  cashFlow: CashFlowDataset;
  payables: CurrentPayableDataset;
  attention: FinancialAttentionDataset;
}>;

export type FinancialManagementSynthesisInput = Readonly<{
  collections: CollectionPerformanceTurnFact;
  receivables: CurrentReceivableDataset;
  cashPosition: CashPositionDataset;
  cashFlow: CashFlowDataset;
  payables: CurrentPayableDataset;
  attention: FinancialAttentionDataset;
}>;

const format = (value: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
const amounts = (rows: readonly Readonly<{ currency: string; amount: number }>[]) => rows.map((row) => `${format(row.amount)} ${row.currency}`).join(" ve ");

export function buildFinancialManagementSynthesis(input: FinancialManagementSynthesisInput): FinancialManagementSynthesisDataset {
  const currencies = new Set<string>();
  input.collections.currencies.forEach((row) => currencies.add(row.currency));
  input.receivables.currencies.forEach((row) => currencies.add(row.currency));
  input.cashPosition.totalsByCurrency.forEach((row) => currencies.add(row.currency));
  input.cashFlow.currencies.forEach((row) => currencies.add(row.currency));
  input.payables.currencies.forEach((row) => currencies.add(row.currency));
  const cashUnavailable = input.attention.items.some((item) => item.reasonCode === "CASH_POSITION_UNAVAILABLE");
  return Object.freeze({
    asOf: input.receivables.asOf,
    timeZone: input.receivables.timeZone,
    period: Object.freeze({ kind: "CURRENT_MONTH", label: input.collections.label, start: input.collections.start, endExclusive: input.collections.endExclusive }),
    evaluatedDimensions: Object.freeze(["COLLECTIONS", "RECEIVABLES", "CASH_POSITION", "ACTUAL_CASH_FLOW", "PAYABLES", "FINANCIAL_ATTENTION"] as const),
    unavailableDimensions: Object.freeze(cashUnavailable ? ["CASH_POSITION"] as const : []),
    currenciesPresent: Object.freeze([...currencies].sort()),
    collections: input.collections,
    receivables: input.receivables,
    cashPosition: input.cashPosition,
    cashFlow: input.cashFlow,
    payables: input.payables,
    attention: input.attention,
  });
}

function attentionText(item: FinancialAttentionItem): string {
  if (item.reasonCode === "RECEIVABLE_OVER_90_DAYS") return `90 günden uzun süredir gecikmiş ${format(item.amount!)} ${item.currency} açık alacak bulunuyor.`;
  if (item.reasonCode === "PAYABLE_OVER_90_DAYS") return `90 günden uzun süredir gecikmiş ${format(item.amount!)} ${item.currency} açık borç bulunuyor.`;
  return `${item.periodLabel} döneminde ${format(item.amount!)} ${item.currency} tahsilat ters kaydı bulunuyor.`;
}

export function buildFinancialManagementSynthesisResponse(dataset: FinancialManagementSynthesisDataset): string {
  const sentences: string[] = [];
  dataset.attention.items.filter((item) => item.kind === "BUSINESS_FACT").forEach((item) => sentences.push(attentionText(item)));

  if (dataset.collections.eventCount === 0) sentences.push(`${dataset.period.label} döneminde gerçekleşmiş tahsilat hareketi bulunmuyor.`);
  else sentences.push(`${dataset.period.label} döneminde net tahsilat ${amounts(dataset.collections.currencies.map((row) => ({ currency: row.currency, amount: row.netCollections })))} olarak gerçekleşti.`);

  const receivables = dataset.receivables.currencies.map((row) => ({ currency: row.currency, amount: row.totalOutstanding, overdue: row.overdueOutstanding }));
  if (receivables.length === 0) sentences.push("Şu anda açık alacak bulunmuyor.");
  else sentences.push(`Şu anda açık alacak ${amounts(receivables)}${receivables.some((row) => row.overdue > 0) ? `; vadesi geçmiş kısmı ${amounts(receivables.filter((row) => row.overdue > 0).map((row) => ({ currency: row.currency, amount: row.overdue })))}` : ""}.`);

  if (!dataset.unavailableDimensions.includes("CASH_POSITION")) sentences.push(`Gerçek nakit pozisyonu ${amounts(dataset.cashPosition.totalsByCurrency)}.`);
  if (dataset.cashFlow.currencies.length === 0) sentences.push(`${dataset.cashFlow.period.label} döneminde gerçek nakit hareketi bulunmuyor.`);
  else sentences.push(`${dataset.cashFlow.period.label} dönemindeki gerçek nakit hareketi ${dataset.cashFlow.currencies.map((row) => `${row.currency}: ${format(row.inflow)} giriş, ${format(row.outflow)} çıkış, net ${format(row.net)}`).join("; ")}.`);

  const payables = dataset.payables.currencies.map((row) => ({ currency: row.currency, amount: row.totalOutstanding, overdue: row.overdueOutstanding }));
  if (payables.length === 0) sentences.push("Şu anda açık borç bulunmuyor.");
  else sentences.push(`Şu anda açık borç ${amounts(payables)}${payables.some((row) => row.overdue > 0) ? `; vadesi geçmiş kısmı ${amounts(payables.filter((row) => row.overdue > 0).map((row) => ({ currency: row.currency, amount: row.overdue })))}` : ""}.`);

  if (dataset.unavailableDimensions.includes("CASH_POSITION")) sentences.push("Bağlı finansal hesap olmadığı için gerçek nakit pozisyonunu değerlendiremiyorum.");
  return sentences.join(" ");
}
