import type { CollectionsDataset } from "./collections-dataset.service";
import type { ResolvedPeriod } from "../date-ranges";

// Phase D3 — the deterministic management-facts layer that sits between
// CollectionsDataset (the canonical per-Settlement-event truth) and the
// PPTX presentation model. Pure function, no I/O: no Prisma, no org
// identifier, no external evidence, no LLM call, no mutation. Every
// number here is derived exclusively from the dataset already passed in —
// this is what lets the XLSX/DOCX/PDF renderers, the PPTX renderer, and
// this summary all reconcile on the same truth without any of them
// recomputing it independently (Artifact Truth, same principle as
// collections-dataset.service.ts's own header comment).
//
// Currencies are never blended (same invariant as
// CollectionsDataset.totalsByCurrency) — every figure below is computed
// independently per currency.

export type CollectionsDailyNet = Readonly<{
  // Calendar date (UTC, YYYY-MM-DD) the events occurred on — matches the
  // same UTC-slice convention already used for date assertions elsewhere
  // in this artifact pipeline (see the existing renderer tests).
  date: string;
  netAmount: number;
}>;

export type CollectionsCustomerNet = Readonly<{
  customerName: string;
  netAmount: number;
}>;

export type CollectionsCurrencySummary = Readonly<{
  currency: string;
  // Sum of ORIGINAL (positive) events only.
  grossCollections: number;
  // Sum of REVERSAL (negative) events only — stays signed negative, never
  // presented as a positive "refund total".
  reversals: number;
  // Always exactly dataset.totalsByCurrency[currency] — never
  // independently recomputed, so this can never drift from the canonical
  // dataset's own total.
  netCollections: number;
  eventCount: number;
  positiveCollectionCount: number;
  reversalCount: number;
  // null when positiveCollectionCount is 0 — never fabricated as 0.
  averagePositiveCollection: number | null;
  largestPositiveCollection: number | null;
  // Ascending by date. Sum of every dailySeries[].netAmount for this
  // currency always equals netCollections exactly, by construction (same
  // signed `amount` field, only regrouped).
  dailySeries: readonly CollectionsDailyNet[];
  // Every distinct customerName for this currency (including the
  // "Bilinmeyen müşteri" fallback — never silently dropped or reassigned),
  // signed net amount, descending by netAmount then ascending by
  // customerName for a fully deterministic order. Whether/how this list is
  // actually presented (eligibility, "Bilinmeyen müşteri" exclusion, top-N
  // truncation) is a presentation decision, made by
  // collections-presentation-model.service.ts, not here — this is the full
  // reconciliation-grade fact set.
  topCustomers: readonly CollectionsCustomerNet[];
}>;

export type CollectionsManagementSummary = Readonly<{
  period: ResolvedPeriod;
  recordCount: number;
  // Ascending alphabetically by currency code — deterministic order.
  currencies: readonly CollectionsCurrencySummary[];
}>;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dateKey(occurredAt: Date): string {
  return occurredAt.toISOString().slice(0, 10);
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildCollectionsManagementSummary(
  dataset: CollectionsDataset,
): CollectionsManagementSummary {
  const currencyCodes = Array.from(new Set(dataset.records.map((record) => record.currency))).sort(compareStrings);

  const currencies = currencyCodes.map((currency): CollectionsCurrencySummary => {
    const rows = dataset.records.filter((record) => record.currency === currency);
    const originals = rows.filter((record) => record.kind === "ORIGINAL");
    const reversalRows = rows.filter((record) => record.kind === "REVERSAL");

    const grossCollections = round2(originals.reduce((sum, record) => sum + record.amount, 0));
    const reversals = round2(reversalRows.reduce((sum, record) => sum + record.amount, 0));
    // Read directly from the dataset's own total — the strongest possible
    // reconciliation guarantee (identity, not coincidental equal math).
    const netCollections = dataset.totalsByCurrency[currency];

    const positiveCollectionCount = originals.length;
    const reversalCount = reversalRows.length;
    const averagePositiveCollection =
      positiveCollectionCount > 0 ? round2(grossCollections / positiveCollectionCount) : null;
    const largestPositiveCollection =
      positiveCollectionCount > 0 ? round2(Math.max(...originals.map((record) => record.amount))) : null;

    const dailyTotals = new Map<string, number>();
    for (const record of rows) {
      const key = dateKey(record.occurredAt);
      dailyTotals.set(key, round2((dailyTotals.get(key) ?? 0) + record.amount));
    }
    const dailySeries = Array.from(dailyTotals.entries())
      .map(([date, netAmount]) => ({ date, netAmount }))
      .sort((a, b) => compareStrings(a.date, b.date));

    const customerTotals = new Map<string, number>();
    for (const record of rows) {
      customerTotals.set(
        record.customerName,
        round2((customerTotals.get(record.customerName) ?? 0) + record.amount),
      );
    }
    const topCustomers = Array.from(customerTotals.entries())
      .map(([customerName, netAmount]) => ({ customerName, netAmount }))
      .sort((a, b) =>
        b.netAmount !== a.netAmount ? b.netAmount - a.netAmount : compareStrings(a.customerName, b.customerName),
      );

    return Object.freeze({
      currency,
      grossCollections,
      reversals,
      netCollections,
      eventCount: rows.length,
      positiveCollectionCount,
      reversalCount,
      averagePositiveCollection,
      largestPositiveCollection,
      dailySeries: Object.freeze(dailySeries),
      topCustomers: Object.freeze(topCustomers),
    });
  });

  return Object.freeze({
    period: dataset.period,
    recordCount: dataset.recordCount,
    currencies: Object.freeze(currencies),
  });
}
