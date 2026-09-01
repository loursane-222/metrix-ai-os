import type { CollectionsDataset } from "../datasets/collections-dataset.service";
import type { CollectionsManagementSummary } from "../datasets/collections-management-summary.service";
import type { ResolvedPeriod } from "../date-ranges";

// Phase D3 — the renderer-independent presentation layer. Owns every
// *business meaning* decision about what is presentation-worthy (is a
// trend meaningful, is a customer ranking meaningful) so that
// collections-pptx-renderer.ts never has to — the renderer only turns
// whatever this model already decided into slides/tables/charts. No
// slide-rendering library import here, no DB access, no LLM, no external
// call: this file is derived exclusively from CollectionsDataset +
// CollectionsManagementSummary, both already computed with zero I/O of
// their own.

// Must match collections-dataset.service.ts's own fallback exactly — this
// is the one place that name is compared against, never redefined.
const UNKNOWN_CUSTOMER_LABEL = "Bilinmeyen müşteri";

// A trend across a single data point isn't a trend — this is the narrow,
// documented eligibility rule for Slide 3 (Daily Trend).
const MIN_DISTINCT_DATES_FOR_TREND = 2;

// A "Top Customers" ranking needs at least two distinct *known* customers
// to mean anything; a single named customer, or none at all (the period's
// collections are entirely under the "Bilinmeyen müşteri" fallback), makes
// the ranking either trivial or actively misleading, so the slide is
// omitted rather than shown. The unknown-customer bucket still exists
// inside CollectionsManagementSummary.topCustomers for internal
// reconciliation; it is simply never displayed as if it were a real named
// customer, and it is never reassigned to another customer's identity.
const MIN_KNOWN_CUSTOMERS_FOR_RANKING = 2;

// Keeps the slide readable; still deterministic (summary.topCustomers is
// already sorted, this only truncates).
const TOP_CUSTOMERS_DISPLAY_LIMIT = 5;

export type CollectionsCurrencyPerformance = Readonly<{
  currency: string;
  grossCollections: number;
  reversals: number;
  netCollections: number;
  eventCount: number;
  positiveCollectionCount: number;
  reversalCount: number;
  averagePositiveCollection: number | null;
  largestPositiveCollection: number | null;
}>;

export type CollectionsDailyChartSeries = Readonly<{
  currency: string;
  // Same length and index-aligned — labels[i] is the date for values[i].
  labels: readonly string[];
  values: readonly number[];
}>;

export type CollectionsTopCustomersSlide = Readonly<{
  currency: string;
  rows: readonly { customerName: string; netAmount: number }[];
}>;

export type CollectionsPresentationModel = Readonly<{
  title: string;
  period: ResolvedPeriod;
  recordCount: number;
  // Same order as summary.currencies (ascending alphabetical) — always
  // present for every currency in the dataset, unconditionally (Slide 1/2).
  currencyPerformance: readonly CollectionsCurrencyPerformance[];
  // Only currencies meeting MIN_DISTINCT_DATES_FOR_TREND — an empty array
  // here means the renderer must not create a Daily Trend slide at all.
  dailyCharts: readonly CollectionsDailyChartSeries[];
  // Only currencies meeting MIN_KNOWN_CUSTOMERS_FOR_RANKING — an empty
  // array here means the renderer must not create a Top Customers slide.
  topCustomerSlides: readonly CollectionsTopCustomersSlide[];
}>;

export function buildCollectionsPresentationModel(
  dataset: CollectionsDataset,
  summary: CollectionsManagementSummary,
): CollectionsPresentationModel {
  const currencyPerformance: CollectionsCurrencyPerformance[] = summary.currencies.map((currency) => ({
    currency: currency.currency,
    grossCollections: currency.grossCollections,
    reversals: currency.reversals,
    netCollections: currency.netCollections,
    eventCount: currency.eventCount,
    positiveCollectionCount: currency.positiveCollectionCount,
    reversalCount: currency.reversalCount,
    averagePositiveCollection: currency.averagePositiveCollection,
    largestPositiveCollection: currency.largestPositiveCollection,
  }));

  const dailyCharts: CollectionsDailyChartSeries[] = summary.currencies
    .filter((currency) => currency.dailySeries.length >= MIN_DISTINCT_DATES_FOR_TREND)
    .map((currency) => ({
      currency: currency.currency,
      labels: currency.dailySeries.map((point) => point.date),
      values: currency.dailySeries.map((point) => point.netAmount),
    }));

  const topCustomerSlides: CollectionsTopCustomersSlide[] = summary.currencies.flatMap((currency) => {
    const knownCustomers = currency.topCustomers.filter((entry) => entry.customerName !== UNKNOWN_CUSTOMER_LABEL);
    if (knownCustomers.length < MIN_KNOWN_CUSTOMERS_FOR_RANKING) return [];
    return [{
      currency: currency.currency,
      rows: knownCustomers.slice(0, TOP_CUSTOMERS_DISPLAY_LIMIT),
    }];
  });

  return Object.freeze({
    title: `Tahsilat Performansı — ${dataset.period.label}`,
    period: dataset.period,
    recordCount: dataset.recordCount,
    currencyPerformance: Object.freeze(currencyPerformance),
    dailyCharts: Object.freeze(dailyCharts),
    topCustomerSlides: Object.freeze(topCustomerSlides),
  });
}
