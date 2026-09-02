import type { QuoteEventType } from "@prisma/client";
import type { ManagementIntent } from "@/lib/conversation-understanding";
import { resolveManagementPeriod } from "@/lib/management-period";

type QuoteActivityIntent = Extract<ManagementIntent, { intent: "QUOTE_ACTIVITY" }>;

export type QuoteActivityDataset = Readonly<{
  intent: QuoteActivityIntent;
  period: Readonly<{ kind: QuoteActivityIntent["period"]; label: string; start: string; endExclusive: string; timeZone: string }>;
  count: number;
}>;

type QuoteActivityReader = Readonly<{
  quote: { count(args: unknown): Promise<number> };
  quoteEvent: { findMany(args: unknown): Promise<readonly { quoteId: string }[]> };
}>;

const EVENT_TYPE = Object.freeze({ SENT: "QUOTE_SENT", VIEWED: "QUOTE_VIEWED" } satisfies Partial<Record<QuoteActivityIntent["activity"], QuoteEventType>>);

export async function buildQuoteActivityDataset(
  organizationId: string,
  input: Readonly<{ intent: QuoteActivityIntent; now: Date; timeZone: string }>,
  reader?: QuoteActivityReader,
): Promise<QuoteActivityDataset> {
  const dataReader = reader ?? (await import("@/lib/core/shared/prisma")).prisma;
  const period = resolveManagementPeriod({ kind: input.intent.period, now: input.now, timeZone: input.timeZone });
  let count: number;
  if (input.intent.activity === "SENT" || input.intent.activity === "VIEWED") {
    const rows = await dataReader.quoteEvent.findMany({
      where: { organizationId, eventType: EVENT_TYPE[input.intent.activity], createdAt: { gte: period.start, lt: period.end } },
      select: { quoteId: true },
    });
    count = input.intent.countMode === "EVENTS" ? rows.length : new Set(rows.map((row) => row.quoteId)).size;
  } else {
    const timestamp = input.intent.activity === "CREATED" ? "createdAt" : input.intent.activity === "ACCEPTED" ? "wonAt" : "lostAt";
    count = await dataReader.quote.count({ where: { organizationId, [timestamp]: { gte: period.start, lt: period.end } } });
  }
  return Object.freeze({
    intent: input.intent,
    period: Object.freeze({ kind: input.intent.period, label: period.label, start: period.start.toISOString(), endExclusive: period.end.toISOString(), timeZone: period.timeZone }),
    count,
  });
}

export function buildQuoteActivityResponse(dataset: QuoteActivityDataset): string {
  const { activity, countMode } = dataset.intent;
  const count = dataset.count;
  if (activity === "CREATED") return count === 0 ? `${dataset.period.label} döneminde oluşturulan teklif bulunmuyor.` : `${dataset.period.label} döneminde ${count} teklif oluşturuldu.`;
  if (activity === "SENT") return count === 0 ? `${dataset.period.label} döneminde gönderilen teklif bulunmuyor.` : countMode === "EVENTS" ? `${dataset.period.label} döneminde teklifler toplam ${count} kez gönderildi.` : `${dataset.period.label} döneminde ${count} farklı teklif gönderildi.`;
  if (activity === "VIEWED") return count === 0 ? `${dataset.period.label} döneminde müşteriler tarafından görüntülenen teklif bulunmuyor.` : countMode === "EVENTS" ? `${dataset.period.label} döneminde teklifler müşteriler tarafından toplam ${count} kez görüntülendi.` : `${dataset.period.label} döneminde ${count} farklı teklif müşteriler tarafından görüntülendi.`;
  if (activity === "ACCEPTED") return count === 0 ? `${dataset.period.label} döneminde kabul edilen teklif bulunmuyor.` : `${dataset.period.label} döneminde ${count} teklif kabul edildi.`;
  return count === 0 ? `${dataset.period.label} döneminde reddedilen teklif bulunmuyor.` : `${dataset.period.label} döneminde ${count} teklif reddedildi.`;
}

export function buildQuoteActivityPromptLine(dataset: QuoteActivityDataset): string {
  return `Canonical quote activity (count-only; not sales/revenue/order/collection/cash): ${JSON.stringify(dataset)}.`;
}
