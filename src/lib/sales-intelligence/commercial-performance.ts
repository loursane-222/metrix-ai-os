import type { ManagementIntent } from "@/lib/conversation-understanding";
import { resolveManagementPeriod } from "@/lib/management-period";

type CohortIntent = Extract<ManagementIntent, { intent: "QUOTE_COHORT" }>;
type BacklogIntent = Extract<ManagementIntent, { intent: "ORDER_BACKLOG" }>;
type QuoteRow = Readonly<{ id: string; status: string; amount: unknown; currency: string }>;
type Reader = Readonly<{
  quoteEvent: { findMany(args: unknown): Promise<readonly { quoteId: string }[]> };
  quote: { findMany(args: unknown): Promise<readonly QuoteRow[]> };
  order: { findMany(args: unknown): Promise<readonly { id: string; status: string; currency: string; deadlineAt: Date | null; items: readonly { lineTotalCents: bigint }[] }[]> };
}>;

export type QuoteSentCohortDataset = Readonly<{ intent: CohortIntent; period: Readonly<{ label: string; start: string; endExclusive: string; timeZone: string }>; sentCount: number; approvedCount: number; rejectedCount: number; continuingCount: number; exceptionalCount: number; currentValuesByCurrency: readonly Readonly<{ currency: string; approved: number; rejected: number; continuing: number; unknownAmountCount: number }>[]; valueSemantics: "CURRENT_QUOTE_AMOUNT_NOT_HISTORICAL_SENT_VALUE" }>;
export type CurrentOrderBacklogDataset = Readonly<{ intent: BacklogIntent; orderCount: number; currencies: readonly Readonly<{ currency: string; orderCount: number; currentUndeliveredValueCents: string; unknownValueCount: number }>[]; valueSemantics: "CURRENT_UNDELIVERED_ORDER_VALUE" }>;

export async function buildQuoteSentCohortDataset(organizationId: string, input: { intent: CohortIntent; now: Date; timeZone: string }, reader?: Reader): Promise<QuoteSentCohortDataset> {
  const db: Reader = reader ?? (await import("@/lib/core/shared/prisma")).prisma as unknown as Reader;
  const period = resolveManagementPeriod({ kind: input.intent.period, now: input.now, timeZone: input.timeZone });
  const events = await db.quoteEvent.findMany({ where: { organizationId, eventType: "QUOTE_SENT", createdAt: { gte: period.start, lt: period.end } }, select: { quoteId: true } });
  const ids = [...new Set(events.map((row) => row.quoteId))];
  const quotes = ids.length ? await db.quote.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, status: true, amount: true, currency: true } }) : [];
  const classify = (status: string) => status === "WON" ? "approved" : status === "LOST" ? "rejected" : ["SENT", "VIEWED", "NEGOTIATION"].includes(status) ? "continuing" : "exceptional";
  const currencies = new Map<string, { approved: number; rejected: number; continuing: number; unknownAmountCount: number }>();
  for (const quote of quotes) { const kind = classify(quote.status); if (kind === "exceptional") continue; const row = currencies.get(quote.currency) ?? { approved: 0, rejected: 0, continuing: 0, unknownAmountCount: 0 }; const amount = quote.amount == null ? null : Number(quote.amount); if (amount === null) row.unknownAmountCount += 1; else row[kind] += amount; currencies.set(quote.currency, row); }
  const count = (kind: string) => quotes.filter((row) => classify(row.status) === kind).length;
  return Object.freeze({ intent: input.intent, period: Object.freeze({ label: period.label, start: period.start.toISOString(), endExclusive: period.end.toISOString(), timeZone: period.timeZone }), sentCount: ids.length, approvedCount: count("approved"), rejectedCount: count("rejected"), continuingCount: count("continuing"), exceptionalCount: count("exceptional") + Math.max(0, ids.length - quotes.length), currentValuesByCurrency: Object.freeze([...currencies].sort(([a], [b]) => a.localeCompare(b)).map(([currency, values]) => Object.freeze({ currency, ...values }))), valueSemantics: "CURRENT_QUOTE_AMOUNT_NOT_HISTORICAL_SENT_VALUE" });
}

export function buildQuoteSentCohortResponse(dataset: QuoteSentCohortDataset): string {
  if (!dataset.sentCount) return `${dataset.period.label} döneminde gönderilmiş teklif bulunmuyor.`;
  const exceptional = dataset.exceptionalCount ? ` ${dataset.exceptionalCount} teklif ise istisnai/diğer durumda.` : "";
  return `${dataset.period.label} döneminde gönderilen ${dataset.sentCount} farklı teklifin güncel sonucu: ${dataset.approvedCount} onaylandı, ${dataset.rejectedCount} reddedildi, ${dataset.continuingCount} teklif devam ediyor.${exceptional} Bu sonuçlar gönderim kohortunun bugünkü durumudur; geçmiş gönderim anındaki tutar snapshot'ı bulunmadığından tarihsel değer toplamı üretilmedi.`;
}

export async function buildCurrentOrderBacklogDataset(organizationId: string, intent: BacklogIntent, reader?: Reader): Promise<CurrentOrderBacklogDataset> {
  const db: Reader = reader ?? (await import("@/lib/core/shared/prisma")).prisma as unknown as Reader;
  const orders = await db.order.findMany({ where: { organizationId, sourceQuoteId: { not: null }, status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true, status: true, currency: true, deadlineAt: true, items: { where: { removedAt: null }, select: { lineTotalCents: true } } } });
  const groups = new Map<string, { orderCount: number; cents: bigint; unknownValueCount: number }>();
  for (const order of orders) { const row = groups.get(order.currency) ?? { orderCount: 0, cents: BigInt(0), unknownValueCount: 0 }; row.orderCount += 1; if (!order.items.length) row.unknownValueCount += 1; else row.cents += order.items.reduce((sum, item) => sum + item.lineTotalCents, BigInt(0)); groups.set(order.currency, row); }
  return Object.freeze({ intent, orderCount: orders.length, currencies: Object.freeze([...groups].sort(([a], [b]) => a.localeCompare(b)).map(([currency, row]) => Object.freeze({ currency, orderCount: row.orderCount, currentUndeliveredValueCents: row.cents.toString(), unknownValueCount: row.unknownValueCount }))), valueSemantics: "CURRENT_UNDELIVERED_ORDER_VALUE" });
}

export function buildCurrentOrderBacklogResponse(dataset: CurrentOrderBacklogDataset): string {
  if (!dataset.orderCount) return "Şu anda teslim bekleyen onaylı teklif bağlantılı sipariş bulunmuyor.";
  const money = (cents: string, currency: string) => `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(Number(BigInt(cents)) / 100)} ${currency}`;
  return `Şu anda teslim bekleyen ${dataset.orderCount} onaylı teklif bağlantılı sipariş bulunuyor. Güncel backlog değeri: ${dataset.currencies.map((row) => `${money(row.currentUndeliveredValueCents, row.currency)}${row.unknownValueCount ? `; ${row.unknownValueCount} siparişin satır değeri belirtilmemiş` : ""}`).join("; ")}.`;
}
