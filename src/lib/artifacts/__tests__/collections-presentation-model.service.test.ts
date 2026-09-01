import { describe, expect, it } from "vitest";
import { buildCollectionsManagementSummary } from "../datasets/collections-management-summary.service";
import { buildCollectionsPresentationModel } from "../presentation/collections-presentation-model.service";
import type { CollectionsDataset, CollectionRecordRow } from "../datasets/collections-dataset.service";

// Phase D3 — proves the presentation model is built only from
// (dataset, summary), never blends currencies, and owns the deterministic
// "is this slide meaningful" decisions (daily trend, top customers) rather
// than leaving that judgment to the renderer.

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

function buildModel(records: CollectionRecordRow[]) {
  const ds = dataset(records);
  const summary = buildCollectionsManagementSummary(ds);
  return { ds, summary, model: buildCollectionsPresentationModel(ds, summary) };
}

describe("buildCollectionsPresentationModel — B. presentation model", () => {
  it("is built only from dataset + summary — presentation values correspond exactly to summary figures", () => {
    const { summary, model } = buildModel([
      row({ amount: 3000, kind: "ORIGINAL" }),
      row({ amount: -500, kind: "REVERSAL" }),
    ]);
    const perf = model.currencyPerformance.find((c) => c.currency === "TRY")!;
    const summaryTry = summary.currencies.find((c) => c.currency === "TRY")!;
    expect(perf.grossCollections).toBe(summaryTry.grossCollections);
    expect(perf.reversals).toBe(summaryTry.reversals);
    expect(perf.netCollections).toBe(summaryTry.netCollections);
    expect(perf.eventCount).toBe(summaryTry.eventCount);
  });

  it("currencies never blended — one currencyPerformance entry per currency, independent figures", () => {
    const { model } = buildModel([
      row({ amount: 3000, currency: "TRY", kind: "ORIGINAL" }),
      row({ amount: 100, currency: "USD", kind: "ORIGINAL" }),
    ]);
    expect(model.currencyPerformance).toHaveLength(2);
    expect(model.currencyPerformance.map((c) => c.currency).sort()).toEqual(["TRY", "USD"]);
  });

  it("daily trend is present only when a currency has at least 2 distinct collection dates", () => {
    const { model: singleDay } = buildModel([
      row({ occurredAt: new Date("2026-08-05T00:00:00Z"), amount: 1000 }),
      row({ occurredAt: new Date("2026-08-05T12:00:00Z"), amount: 500 }),
    ]);
    expect(singleDay.dailyCharts).toEqual([]);

    const { model: twoDays } = buildModel([
      row({ occurredAt: new Date("2026-08-05T00:00:00Z"), amount: 1000 }),
      row({ occurredAt: new Date("2026-08-06T00:00:00Z"), amount: 500 }),
    ]);
    expect(twoDays.dailyCharts).toHaveLength(1);
    expect(twoDays.dailyCharts[0]!.labels).toEqual(["2026-08-05", "2026-08-06"]);
    expect(twoDays.dailyCharts[0]!.values).toEqual([1000, 500]);
  });

  it("daily chart series index-aligns labels and values with the summary's dailySeries", () => {
    const { summary, model } = buildModel([
      row({ occurredAt: new Date("2026-08-05T00:00:00Z"), amount: 1000 }),
      row({ occurredAt: new Date("2026-08-06T00:00:00Z"), amount: -200, kind: "REVERSAL" }),
      row({ occurredAt: new Date("2026-08-07T00:00:00Z"), amount: 300 }),
    ]);
    const chart = model.dailyCharts[0]!;
    const summaryDaily = summary.currencies[0]!.dailySeries;
    expect(chart.labels).toEqual(summaryDaily.map((d) => d.date));
    expect(chart.values).toEqual(summaryDaily.map((d) => d.netAmount));
  });

  it("no Management Notes / free-text field exists on the presentation model", () => {
    const { model } = buildModel([row({})]);
    expect(model).not.toHaveProperty("managementNotes");
    expect(model).not.toHaveProperty("notes");
    expect(model).not.toHaveProperty("commentary");
  });

  it("deterministic title and period pass through", () => {
    const { ds, model } = buildModel([row({})]);
    expect(model.title).toBe(`Tahsilat Performansı — ${ds.period.label}`);
    expect(model.period).toEqual(ds.period);
    expect(model.recordCount).toBe(ds.recordCount);
  });
});

describe("buildCollectionsPresentationModel — G. top-customer eligibility policy", () => {
  it("meaningful real customer set (>=2 known customers) → slide present, ranked by net amount", () => {
    const { model } = buildModel([
      row({ customerName: "Atlas İnşaat", amount: 3000 }),
      row({ customerName: "Deneme Firması", amount: 1500 }),
    ]);
    expect(model.topCustomerSlides).toHaveLength(1);
    expect(model.topCustomerSlides[0]!.rows.map((r) => r.customerName)).toEqual(["Atlas İnşaat", "Deneme Firması"]);
  });

  it("only one known customer → slide absent (a ranking of one is not a ranking)", () => {
    const { model } = buildModel([
      row({ customerName: "Atlas İnşaat", amount: 3000 }),
    ]);
    expect(model.topCustomerSlides).toEqual([]);
  });

  it("identity dominated by 'Bilinmeyen müşteri' with fewer than 2 known customers → slide absent", () => {
    const { model } = buildModel([
      row({ customerName: "Bilinmeyen müşteri", amount: 5000 }),
      row({ customerName: "Bilinmeyen müşteri", amount: 3000, occurredAt: new Date("2026-08-06T00:00:00Z") }),
      row({ customerName: "Atlas İnşaat", amount: 100 }),
    ]);
    expect(model.topCustomerSlides).toEqual([]);
  });

  it("'Bilinmeyen müşteri' never appears as a displayed row, never reassigned to another customer, even when the slide is otherwise eligible", () => {
    const { model } = buildModel([
      row({ customerName: "Atlas İnşaat", amount: 3000 }),
      row({ customerName: "Deneme Firması", amount: 1500 }),
      row({ customerName: "Bilinmeyen müşteri", amount: 9000 }),
    ]);
    expect(model.topCustomerSlides).toHaveLength(1);
    const names = model.topCustomerSlides[0]!.rows.map((r) => r.customerName);
    expect(names).not.toContain("Bilinmeyen müşteri");
    expect(names).toEqual(["Atlas İnşaat", "Deneme Firması"]);
    // The unknown bucket's amount must never be folded into a known
    // customer's displayed total.
    expect(model.topCustomerSlides[0]!.rows.find((r) => r.customerName === "Atlas İnşaat")!.netAmount).toBe(3000);
  });

  it("eligibility and ranking are evaluated independently per currency", () => {
    const { model } = buildModel([
      row({ customerName: "Atlas İnşaat", amount: 3000, currency: "TRY" }),
      row({ customerName: "Deneme Firması", amount: 1500, currency: "TRY" }),
      row({ customerName: "Only Known Co", amount: 100, currency: "USD" }),
    ]);
    const tryCurrencies = model.topCustomerSlides.map((s) => s.currency);
    expect(tryCurrencies).toEqual(["TRY"]);
  });
});
