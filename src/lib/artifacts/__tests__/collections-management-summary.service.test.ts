import { describe, expect, it } from "vitest";
import { buildCollectionsManagementSummary } from "../datasets/collections-management-summary.service";
import type { CollectionsDataset, CollectionRecordRow } from "../datasets/collections-dataset.service";

// Phase D3 — proves the deterministic summary layer's arithmetic
// reconciles exactly with CollectionsDataset, currency isolation holds,
// reversal semantics stay signed, and every ordering is deterministic
// (never dependent on input array order, object key iteration, or Map
// insertion order surviving by luck).

function row(overrides: Partial<CollectionRecordRow>): CollectionRecordRow {
  return {
    occurredAt: new Date("2026-08-05T00:00:00Z"),
    customerName: "Atlas İnşaat",
    title: "Ağustos tahsilatı",
    amount: 1000,
    currency: "TRY",
    invoiceNumber: "INV-001",
    kind: "ORIGINAL",
    ...overrides,
  };
}

function dataset(records: CollectionRecordRow[]): CollectionsDataset {
  const totalsByCurrency: Record<string, number> = {};
  for (const record of records) {
    totalsByCurrency[record.currency] = Math.round(((totalsByCurrency[record.currency] ?? 0) + record.amount) * 100) / 100;
  }
  return Object.freeze({
    period: { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z"), label: "Ağustos 2026", isoLabel: "2026-08" },
    records: Object.freeze(records),
    recordCount: records.length,
    totalsByCurrency: Object.freeze(totalsByCurrency),
  });
}

describe("buildCollectionsManagementSummary — A. summary truth", () => {
  it("computes gross ORIGINAL sum, signed reversal sum, and event/positive/reversal counts", () => {
    const ds = dataset([
      row({ amount: 3000, kind: "ORIGINAL" }),
      row({ amount: 2000, kind: "ORIGINAL" }),
      row({ amount: -500, kind: "REVERSAL" }),
    ]);
    const summary = buildCollectionsManagementSummary(ds);
    const try_ = summary.currencies.find((c) => c.currency === "TRY")!;
    expect(try_.grossCollections).toBe(5000);
    expect(try_.reversals).toBe(-500);
    expect(try_.eventCount).toBe(3);
    expect(try_.positiveCollectionCount).toBe(2);
    expect(try_.reversalCount).toBe(1);
  });

  it("net reconciles exactly with dataset.totalsByCurrency[currency]", () => {
    const ds = dataset([
      row({ amount: 3000.33, kind: "ORIGINAL" }),
      row({ amount: -1200.11, kind: "REVERSAL" }),
    ]);
    const summary = buildCollectionsManagementSummary(ds);
    const try_ = summary.currencies.find((c) => c.currency === "TRY")!;
    expect(try_.netCollections).toBe(ds.totalsByCurrency.TRY);
  });

  it("average positive collection is gross / positiveCollectionCount, null when there are no ORIGINAL rows", () => {
    const ds = dataset([
      row({ amount: 3000, kind: "ORIGINAL" }),
      row({ amount: 1000, kind: "ORIGINAL" }),
      row({ amount: -500, kind: "REVERSAL" }),
    ]);
    const summary = buildCollectionsManagementSummary(ds);
    expect(summary.currencies[0]!.averagePositiveCollection).toBe(2000);

    const reversalOnly = dataset([row({ amount: -500, kind: "REVERSAL" })]);
    const reversalSummary = buildCollectionsManagementSummary(reversalOnly);
    expect(reversalSummary.currencies[0]!.averagePositiveCollection).toBeNull();
    expect(reversalSummary.currencies[0]!.largestPositiveCollection).toBeNull();
  });

  it("largest positive collection is the max ORIGINAL amount", () => {
    const ds = dataset([
      row({ amount: 500, kind: "ORIGINAL" }),
      row({ amount: 4200, kind: "ORIGINAL" }),
      row({ amount: 1800, kind: "ORIGINAL" }),
    ]);
    const summary = buildCollectionsManagementSummary(ds);
    expect(summary.currencies[0]!.largestPositiveCollection).toBe(4200);
  });

  it("never blends currencies — separate independent figures per currency", () => {
    const ds = dataset([
      row({ amount: 3000, currency: "TRY", kind: "ORIGINAL" }),
      row({ amount: 100, currency: "USD", kind: "ORIGINAL" }),
      row({ amount: -50, currency: "USD", kind: "REVERSAL" }),
    ]);
    const summary = buildCollectionsManagementSummary(ds);
    expect(summary.currencies).toHaveLength(2);
    const try_ = summary.currencies.find((c) => c.currency === "TRY")!;
    const usd = summary.currencies.find((c) => c.currency === "USD")!;
    expect(try_.grossCollections).toBe(3000);
    expect(try_.netCollections).toBe(3000);
    expect(usd.grossCollections).toBe(100);
    expect(usd.netCollections).toBe(50);
  });

  it("currencies are ordered deterministically (ascending alphabetical)", () => {
    const ds = dataset([
      row({ amount: 100, currency: "USD", kind: "ORIGINAL" }),
      row({ amount: 200, currency: "EUR", kind: "ORIGINAL" }),
      row({ amount: 300, currency: "TRY", kind: "ORIGINAL" }),
    ]);
    const summary = buildCollectionsManagementSummary(ds);
    expect(summary.currencies.map((c) => c.currency)).toEqual(["EUR", "TRY", "USD"]);
  });

  it("deterministic daily aggregation: every distinct date is grouped, and the sum of dailySeries reconciles exactly to netCollections", () => {
    const ds = dataset([
      row({ occurredAt: new Date("2026-08-03T00:00:00Z"), amount: 1000, kind: "ORIGINAL" }),
      row({ occurredAt: new Date("2026-08-03T12:00:00Z"), amount: 500, kind: "ORIGINAL" }),
      row({ occurredAt: new Date("2026-08-10T00:00:00Z"), amount: -300, kind: "REVERSAL" }),
      row({ occurredAt: new Date("2026-08-01T00:00:00Z"), amount: 200, kind: "ORIGINAL" }),
    ]);
    const summary = buildCollectionsManagementSummary(ds);
    const try_ = summary.currencies[0]!;
    expect(try_.dailySeries.map((d) => d.date)).toEqual(["2026-08-01", "2026-08-03", "2026-08-10"]);
    expect(try_.dailySeries.find((d) => d.date === "2026-08-03")!.netAmount).toBe(1500);
    const dailyTotal = try_.dailySeries.reduce((sum, d) => sum + d.netAmount, 0);
    expect(Math.round(dailyTotal * 100) / 100).toBe(try_.netCollections);
  });

  it("top customers use signed amounts so a reversal reduces the customer's net", () => {
    const ds = dataset([
      row({ customerName: "Atlas İnşaat", amount: 3000, kind: "ORIGINAL" }),
      row({ customerName: "Atlas İnşaat", amount: -1000, kind: "REVERSAL" }),
      row({ customerName: "Deneme Firması", amount: 1500, kind: "ORIGINAL" }),
    ]);
    const summary = buildCollectionsManagementSummary(ds);
    const atlas = summary.currencies[0]!.topCustomers.find((c) => c.customerName === "Atlas İnşaat")!;
    expect(atlas.netAmount).toBe(2000);
  });

  it("deterministic top-customer ordering: descending net amount, tie-broken alphabetically", () => {
    const ds = dataset([
      row({ customerName: "Zebra Ltd", amount: 500, kind: "ORIGINAL" }),
      row({ customerName: "Atlas İnşaat", amount: 500, kind: "ORIGINAL" }),
      row({ customerName: "Deneme Firması", amount: 900, kind: "ORIGINAL" }),
    ]);
    const summary = buildCollectionsManagementSummary(ds);
    const names = summary.currencies[0]!.topCustomers.map((c) => c.customerName);
    expect(names).toEqual(["Deneme Firması", "Atlas İnşaat", "Zebra Ltd"]);
  });

  it("never silently reassigns the 'Bilinmeyen müşteri' fallback — it participates in aggregation under its own name", () => {
    const ds = dataset([
      row({ customerName: "Bilinmeyen müşteri", amount: 700, kind: "ORIGINAL" }),
      row({ customerName: "Atlas İnşaat", amount: 300, kind: "ORIGINAL" }),
    ]);
    const summary = buildCollectionsManagementSummary(ds);
    const names = summary.currencies[0]!.topCustomers.map((c) => c.customerName);
    expect(names).toContain("Bilinmeyen müşteri");
    expect(summary.currencies[0]!.topCustomers.find((c) => c.customerName === "Bilinmeyen müşteri")!.netAmount).toBe(700);
  });

  it("recordCount and period pass through unchanged from the dataset", () => {
    const ds = dataset([row({})]);
    const summary = buildCollectionsManagementSummary(ds);
    expect(summary.recordCount).toBe(ds.recordCount);
    expect(summary.period).toEqual(ds.period);
  });

  it("an empty dataset produces zero currency summaries", () => {
    const ds = dataset([]);
    const summary = buildCollectionsManagementSummary(ds);
    expect(summary.currencies).toEqual([]);
    expect(summary.recordCount).toBe(0);
  });
});
