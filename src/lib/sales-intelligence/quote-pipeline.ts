import type { ManagementIntent } from "@/lib/conversation-understanding";

type QuotePipelineIntent = Extract<ManagementIntent, { intent: "QUOTE_PIPELINE" }>;
type QuotePipelineRow = Readonly<{ id: string; title: string; status: "SENT" | "VIEWED" | "NEGOTIATION"; amount: unknown; currency: string; customerId: string | null; customer: { id: string; displayName: string } | null }>;
type QuotePipelineReader = Readonly<{ quote: { findMany(args: unknown): Promise<readonly QuotePipelineRow[]> } }>;

export type CurrentQuotePipelineItem = Readonly<{ quoteId: string; title: string; status: QuotePipelineRow["status"]; amount: number | null; currency: string; customerId: string | null; customerName: string }>;
export type CurrentQuotePipelineCurrency = Readonly<{ currency: string; quoteCount: number; knownValue: number; unknownAmountCount: number; quotes: readonly CurrentQuotePipelineItem[] }>;
export type CurrentQuotePipelineCustomer = Readonly<{ customerId: string | null; customerName: string; quoteCount: number; currencies: readonly Readonly<{ currency: string; knownValue: number; unknownAmountCount: number }>[] }>;
export type CurrentQuotePipelineDataset = Readonly<{ intent: QuotePipelineIntent; openQuoteCount: number; currencies: readonly CurrentQuotePipelineCurrency[]; customers: readonly CurrentQuotePipelineCustomer[] }>;

const OPEN_STATUSES: ("SENT" | "VIEWED" | "NEGOTIATION")[] = ["SENT", "VIEWED", "NEGOTIATION"];
const money = (value: number, currency: string) => `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const numericAmount = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);

export async function buildCurrentQuotePipelineDataset(organizationId: string, intent: QuotePipelineIntent, reader?: QuotePipelineReader): Promise<CurrentQuotePipelineDataset> {
  const dataReader: QuotePipelineReader = reader ?? (await import("@/lib/core/shared/prisma")).prisma as unknown as QuotePipelineReader;
  const source = await dataReader.quote.findMany({
    where: { organizationId, status: { in: OPEN_STATUSES } },
    select: { id: true, title: true, status: true, amount: true, currency: true, customerId: true, customer: { select: { id: true, displayName: true } } },
  });
  const items = source.map((row): CurrentQuotePipelineItem => Object.freeze({
    quoteId: row.id, title: row.title, status: row.status, amount: numericAmount(row.amount), currency: row.currency,
    customerId: row.customer?.id ?? null, customerName: row.customer?.displayName ?? "Müşterisi belirtilmemiş",
  }));
  const currencies = [...new Set(items.map((row) => row.currency))].sort().map((currency): CurrentQuotePipelineCurrency => {
    const quotes = items.filter((row) => row.currency === currency).sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1) || a.title.localeCompare(b.title, "tr"));
    return Object.freeze({ currency, quoteCount: quotes.length, knownValue: roundMoney(quotes.reduce((sum, row) => sum + (row.amount ?? 0), 0)), unknownAmountCount: quotes.filter((row) => row.amount === null).length, quotes: Object.freeze(quotes) });
  });
  const groups = new Map<string, CurrentQuotePipelineItem[]>();
  for (const row of items) { const key = row.customerId ?? "__unknown__"; groups.set(key, [...(groups.get(key) ?? []), row]); }
  const customers = [...groups.entries()].map(([key, rows]): CurrentQuotePipelineCustomer => Object.freeze({
    customerId: key === "__unknown__" ? null : key, customerName: rows[0].customerName, quoteCount: rows.length,
    currencies: Object.freeze([...new Set(rows.map((row) => row.currency))].sort().map((currency) => { const matching = rows.filter((row) => row.currency === currency); return Object.freeze({ currency, knownValue: roundMoney(matching.reduce((sum, row) => sum + (row.amount ?? 0), 0)), unknownAmountCount: matching.filter((row) => row.amount === null).length }); })),
  })).sort((a, b) => a.customerName.localeCompare(b.customerName, "tr"));
  return Object.freeze({ intent, openQuoteCount: items.length, currencies: Object.freeze(currencies), customers: Object.freeze(customers) });
}

const amountSummary = (dataset: CurrentQuotePipelineDataset) => dataset.currencies.map((row) => row.unknownAmountCount > 0 ? `bilinen tutar ${money(row.knownValue, row.currency)}; ${row.unknownAmountCount} teklifin tutarı belirtilmemiş` : money(row.knownValue, row.currency)).join("; ");

export function buildCurrentQuotePipelineResponse(dataset: CurrentQuotePipelineDataset): string {
  if (dataset.openQuoteCount === 0) return "Şu anda açık teklif bulunmuyor.";
  if (dataset.intent.queryMode === "SUMMARY") return `Şu anda ${dataset.openQuoteCount} açık teklif bulunuyor. Güncel açık teklif değeri: ${amountSummary(dataset)}.`;
  if (dataset.intent.queryMode === "TOTAL_VALUE") return `Güncel açık tekliflerin toplam değeri: ${amountSummary(dataset)}.`;
  if (dataset.intent.queryMode === "LARGEST_OPEN") {
    const sections = dataset.currencies.map((group) => { const ranked = group.quotes.filter((row) => row.amount !== null).slice(0, 3).map((row) => `${row.title}: ${money(row.amount!, row.currency)}`); return `${group.currency}: ${ranked.length > 0 ? ranked.join(", ") : "tutarı belirtilmiş açık teklif yok"}${group.unknownAmountCount > 0 ? `; ${group.unknownAmountCount} teklifin tutarı belirtilmemiş` : ""}`; });
    return `En büyük güncel açık teklifler para birimi bazında: ${sections.join("; ")}.`;
  }
  const customers = dataset.customers.map((customer) => `${customer.customerName}: ${customer.quoteCount} teklif (${customer.currencies.map((row) => row.unknownAmountCount > 0 ? `bilinen tutar ${money(row.knownValue, row.currency)}, ${row.unknownAmountCount} teklifin tutarı belirtilmemiş` : money(row.knownValue, row.currency)).join("; ")})`);
  return `Güncel açık teklifler müşteri bazında: ${customers.join("; ")}.`;
}

export function buildCurrentQuotePipelinePromptLine(dataset: CurrentQuotePipelineDataset): string {
  return `Canonical current quote pipeline (not sales/revenue/forecast/orders/collections/cash): ${JSON.stringify(dataset)}.`;
}
