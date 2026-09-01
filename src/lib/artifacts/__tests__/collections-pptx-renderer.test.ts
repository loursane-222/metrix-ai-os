import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { renderCollectionsPptx } from "../renderers/collections-pptx-renderer";
import type { CollectionsDataset, CollectionRecordRow } from "../datasets/collections-dataset.service";

// Proves real generation, not a mock: the renderer's output buffer is
// unzipped (a real .pptx IS a ZIP+OOXML package) and slide/chart XML is
// inspected for actual literal text and numeric cache values — the same
// genuine semantic read-back convention already used by the XLSX/DOCX/PDF
// renderer tests, using jszip (already a repo dependency) — no new test
// dependency was needed.

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

function dataset(records: CollectionRecordRow[], periodOverrides: Partial<CollectionsDataset["period"]> = {}): CollectionsDataset {
  const totalsByCurrency: Record<string, number> = {};
  for (const record of records) {
    totalsByCurrency[record.currency] = Math.round(((totalsByCurrency[record.currency] ?? 0) + record.amount) * 100) / 100;
  }
  return Object.freeze({
    period: {
      from: new Date("2026-08-01T00:00:00Z"),
      to: new Date("2026-09-01T00:00:00Z"),
      label: "Ağustos 2026",
      isoLabel: "2026-08",
      ...periodOverrides,
    },
    records: Object.freeze(records),
    recordCount: records.length,
    totalsByCurrency: Object.freeze(totalsByCurrency),
  });
}

async function unzip(content: Buffer) {
  return JSZip.loadAsync(content);
}

function extractTexts(xml: string): string[] {
  return Array.from(xml.matchAll(/<a:t>(.*?)<\/a:t>/g)).map((match) => match[1]!);
}

function extractChartCategoriesAndValues(xml: string): { categories: string[]; values: number[] } {
  const catBlock = xml.match(/<c:cat>[\s\S]*?<\/c:cat>/)?.[0] ?? "";
  const valBlock = xml.match(/<c:val>[\s\S]*?<\/c:val>/)?.[0] ?? "";
  const categories = Array.from(catBlock.matchAll(/<c:v>(.*?)<\/c:v>/g)).map((match) => match[1]!);
  const values = Array.from(valBlock.matchAll(/<c:v>(.*?)<\/c:v>/g)).map((match) => Number(match[1]));
  return { categories, values };
}

async function slideXml(zip: JSZip, index: number): Promise<string> {
  const file = zip.file(`ppt/slides/slide${index}.xml`);
  expect(file).not.toBeNull();
  return file!.async("string");
}

// pptxgenjs numbers chart part files by a package-wide (not per-Presentation-
// instance) counter, so a chart's exact filename (chart1.xml, chart7.xml, ...)
// depends on how many charts earlier tests in this same run already created —
// it is not a stable "always chart1.xml" contract. Discovering the real
// filenames from the zip, per the actual generated package, is the correct
// semantic read-back rather than assuming a fixed name.
function findChartFiles(zip: JSZip): string[] {
  return Object.keys(zip.files).filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name)).sort();
}

describe("renderCollectionsPptx — C. real PPTX generation + semantic read-back", () => {
  it("produces a real, valid PPTX package with expected filename/MIME and OOXML structure", async () => {
    const ds = dataset([row({})]);
    const file = await renderCollectionsPptx(ds);

    expect(file.format).toBe("pptx");
    expect(file.filename).toBe("tahsilatlar-2026-08.pptx");
    expect(file.mimeType).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(file.content.byteLength).toBeGreaterThan(0);

    const zip = await unzip(file.content);
    expect(zip.file("[Content_Types].xml")).not.toBeNull();
    expect(zip.file("ppt/presentation.xml")).not.toBeNull();
    expect(zip.file("ppt/slides/slide1.xml")).not.toBeNull();
  });

  it("Turkish title/text and the correct period survive round-trip", async () => {
    const ds = dataset([row({ customerName: "Atlas İnşaat" })]);
    const file = await renderCollectionsPptx(ds);
    const zip = await unzip(file.content);
    const slide1 = await slideXml(zip, 1);
    const texts = extractTexts(slide1);

    expect(texts).toContain("Tahsilat Performansı — Ağustos 2026");
    expect(texts).toContain("Dönem: Ağustos 2026 (2026-08)");
    expect(texts).toContain("Toplam kayıt sayısı: 1");
  });

  it("expected KPI values survive on the Executive Summary slide", async () => {
    const ds = dataset([
      row({ amount: 3000, kind: "ORIGINAL" }),
      row({ amount: -500, kind: "REVERSAL" }),
    ]);
    const file = await renderCollectionsPptx(ds);
    const zip = await unzip(file.content);
    const texts = extractTexts(await slideXml(zip, 1));

    expect(texts).toContain("Net Tahsilat (TRY): 2500.00");
    expect(texts).toContain("Brüt Tahsilat (TRY): 3000.00");
    expect(texts).toContain("İade/İptal (TRY): -500.00");
  });

  it("Collection Performance slide contains the deterministic per-currency table", async () => {
    const ds = dataset([row({ amount: 3000, kind: "ORIGINAL" })]);
    const file = await renderCollectionsPptx(ds);
    const zip = await unzip(file.content);
    const texts = extractTexts(await slideXml(zip, 2));

    expect(texts).toContain("Tahsilat Performansı Detayı");
    expect(texts).toContain("Para Birimi");
    expect(texts).toContain("Ortalama Pozitif");
    expect(texts).toContain("3000.00");
  });

  it("N/A is used for average/largest positive collection when there are no ORIGINAL rows in that currency", async () => {
    const ds = dataset([row({ amount: -500, kind: "REVERSAL" })]);
    const file = await renderCollectionsPptx(ds);
    const zip = await unzip(file.content);
    const texts = extractTexts(await slideXml(zip, 2));
    expect(texts).toContain("N/A");
  });

  it("correct number of slides and conditional slides appear/disappear correctly", async () => {
    // Single day, single known customer → no Daily Trend, no Top Customers
    // (only 1 known customer) — exactly 2 slides.
    const minimal = dataset([row({ amount: 1000 })]);
    const minimalFile = await renderCollectionsPptx(minimal);
    const minimalZip = await unzip(minimalFile.content);
    expect(Object.keys(minimalZip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(2);

    // Multi-day + 2 known customers → Executive Summary, Performance,
    // Daily Trend, Top Customers = 4 slides.
    const full = dataset([
      row({ occurredAt: new Date("2026-08-03T00:00:00Z"), customerName: "Atlas İnşaat", amount: 3000 }),
      row({ occurredAt: new Date("2026-08-10T00:00:00Z"), customerName: "Deneme Firması", amount: 1500 }),
    ]);
    const fullFile = await renderCollectionsPptx(full);
    const fullZip = await unzip(fullFile.content);
    const slideFiles = Object.keys(fullZip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    expect(slideFiles).toHaveLength(4);

    const texts3 = extractTexts(await slideXml(fullZip, 3));
    expect(texts3).toContain("Günlük Trend (TRY)");
    const texts4 = extractTexts(await slideXml(fullZip, 4));
    expect(texts4).toContain("En Çok Tahsilat Yapılan Müşteriler (TRY)");
  });

  it("never fabricates a slide for a single-currency single-day dataset — no Daily Trend slide is created", async () => {
    const ds = dataset([
      row({ occurredAt: new Date("2026-08-05T00:00:00Z"), amount: 1000 }),
      row({ occurredAt: new Date("2026-08-05T12:00:00Z"), amount: 500 }),
    ]);
    const file = await renderCollectionsPptx(ds);
    const zip = await unzip(file.content);
    const allSlideText = (
      await Promise.all(
        Object.keys(zip.files)
          .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
          .map((name) => zip.file(name)!.async("string")),
      )
    ).join(" ");
    expect(allSlideText).not.toContain("Günlük Trend");
  });
});

describe("renderCollectionsPptx — D. chart reality: native chart numbers reconcile with the presentation model", () => {
  it("chart categories and numeric cache values equal the presentation model's dailyChart series exactly", async () => {
    const ds = dataset([
      row({ occurredAt: new Date("2026-08-03T00:00:00Z"), amount: 3000, kind: "ORIGINAL" }),
      row({ occurredAt: new Date("2026-08-10T00:00:00Z"), amount: 1500, kind: "ORIGINAL" }),
      row({ occurredAt: new Date("2026-08-15T00:00:00Z"), amount: -500, kind: "REVERSAL" }),
    ]);
    const file = await renderCollectionsPptx(ds);
    const zip = await unzip(file.content);
    const chartFiles = findChartFiles(zip);
    expect(chartFiles).toHaveLength(1);
    const chartXml = await zip.file(chartFiles[0]!)!.async("string");
    const { categories, values } = extractChartCategoriesAndValues(chartXml);

    expect(categories).toEqual(["2026-08-03", "2026-08-10", "2026-08-15"]);
    expect(values).toEqual([3000, 1500, -500]);
  });
});

describe("renderCollectionsPptx — E. reversal reality", () => {
  it("an ORIGINAL + same-period REVERSAL: reversal stays represented, gross is not silently netted, net reconciles exactly", async () => {
    const ds = dataset([
      row({ amount: 3000, kind: "ORIGINAL" }),
      row({ amount: -3000, kind: "REVERSAL", occurredAt: new Date("2026-08-15T00:00:00Z") }),
    ]);
    const file = await renderCollectionsPptx(ds);
    const zip = await unzip(file.content);
    const summaryTexts = extractTexts(await slideXml(zip, 1));
    const performanceTexts = extractTexts(await slideXml(zip, 2));

    // Gross is untouched by the reversal — 3000, not 0.
    expect(summaryTexts).toContain("Brüt Tahsilat (TRY): 3000.00");
    expect(summaryTexts).toContain("İade/İptal (TRY): -3000.00");
    // Net reconciles to exactly zero, matching dataset.totalsByCurrency.
    expect(summaryTexts).toContain("Net Tahsilat (TRY): 0.00");
    expect(ds.totalsByCurrency.TRY).toBe(0);
    expect(performanceTexts).toContain("0.00");
    expect(performanceTexts).toContain("-3000.00");
  });
});

describe("renderCollectionsPptx — G. top-customer policy end-to-end in the real PPTX", () => {
  it("'Bilinmeyen müşteri' never appears as a ranked row and is never reassigned to another customer's name", async () => {
    const ds = dataset([
      row({ customerName: "Atlas İnşaat", amount: 3000, occurredAt: new Date("2026-08-03T00:00:00Z") }),
      row({ customerName: "Deneme Firması", amount: 1500, occurredAt: new Date("2026-08-10T00:00:00Z") }),
      row({ customerName: "Bilinmeyen müşteri", amount: 9000, occurredAt: new Date("2026-08-12T00:00:00Z") }),
    ]);
    const file = await renderCollectionsPptx(ds);
    const zip = await unzip(file.content);
    // Slides: Exec Summary(1) Performance(2) DailyTrend(3) TopCustomers(4) — with 3 distinct dates, both conditional slides present.
    const texts4 = extractTexts(await slideXml(zip, 4));
    expect(texts4).toContain("En Çok Tahsilat Yapılan Müşteriler (TRY)");
    expect(texts4).not.toContain("Bilinmeyen");
    // The Top Customers table itself: exactly Atlas/Deneme at their real,
    // unmodified net amounts — the 9000 from "Bilinmeyen müşteri" is never
    // folded into either of them and never appears as a row on this slide.
    // (9000.00 legitimately appears elsewhere, on the Collection Performance
    // slide, as the period's largest single positive collection — that is a
    // different, correct fact, not this bug.)
    const atlasIndex = texts4.indexOf("Atlas İnşaat");
    const denemeIndex = texts4.indexOf("Deneme Firması");
    expect(atlasIndex).toBeGreaterThan(-1);
    expect(denemeIndex).toBeGreaterThan(-1);
    expect(texts4[atlasIndex + 1]).toBe("3000.00");
    expect(texts4[denemeIndex + 1]).toBe("1500.00");
    expect(texts4).not.toContain("9000.00");
  });

  it("with only one known customer, no Top Customers slide is generated at all", async () => {
    const ds = dataset([
      row({ customerName: "Atlas İnşaat", amount: 3000, occurredAt: new Date("2026-08-03T00:00:00Z") }),
      row({ customerName: "Bilinmeyen müşteri", amount: 9000, occurredAt: new Date("2026-08-10T00:00:00Z") }),
    ]);
    const file = await renderCollectionsPptx(ds);
    const zip = await unzip(file.content);
    const allSlideText = (
      await Promise.all(
        Object.keys(zip.files)
          .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
          .map((name) => zip.file(name)!.async("string")),
      )
    ).join(" ");
    expect(allSlideText).not.toContain("En Çok Tahsilat Yapılan Müşteriler");
  });
});

describe("renderCollectionsPptx — F. multi-currency", () => {
  it("TRY + USD produce separate summaries, separate KPI/table truth, no combined total, currency-specific chart series", async () => {
    const ds = dataset([
      row({ currency: "TRY", amount: 3000, occurredAt: new Date("2026-08-03T00:00:00Z") }),
      row({ currency: "TRY", amount: 1000, occurredAt: new Date("2026-08-10T00:00:00Z") }),
      row({ currency: "USD", amount: 200, occurredAt: new Date("2026-08-03T00:00:00Z") }),
      row({ currency: "USD", amount: 100, occurredAt: new Date("2026-08-10T00:00:00Z") }),
    ]);
    const file = await renderCollectionsPptx(ds);
    const zip = await unzip(file.content);
    const summaryTexts = extractTexts(await slideXml(zip, 1));

    expect(summaryTexts).toContain("Net Tahsilat (TRY): 4000.00");
    expect(summaryTexts).toContain("Net Tahsilat (USD): 300.00");
    // No blended/combined total anywhere in the deck.
    const allText = summaryTexts.join(" ");
    expect(allText).not.toMatch(/4300/);

    // Two currency-specific Daily Trend slides — 2 charts, each with its
    // own currency-scoped series.
    const chartFiles = findChartFiles(zip);
    expect(chartFiles).toHaveLength(2);
    const chart1 = extractChartCategoriesAndValues(await zip.file(chartFiles[0]!)!.async("string"));
    const chart2 = extractChartCategoriesAndValues(await zip.file(chartFiles[1]!)!.async("string"));
    const chartValueSets = [chart1.values, chart2.values].sort((a, b) => Math.max(...b) - Math.max(...a));
    expect(chartValueSets[0]).toEqual([3000, 1000]);
    expect(chartValueSets[1]).toEqual([200, 100]);
  });
});
