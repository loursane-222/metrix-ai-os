import PptxGenJS from "pptxgenjs";
import type { CollectionsDataset } from "../datasets/collections-dataset.service";
import { buildCollectionsManagementSummary } from "../datasets/collections-management-summary.service";
import {
  buildCollectionsPresentationModel,
  type CollectionsPresentationModel,
  type CollectionsCurrencyPerformance,
  type CollectionsDailyChartSeries,
  type CollectionsTopCustomersSlide,
} from "../presentation/collections-presentation-model.service";
import { ARTIFACT_MIME_TYPES, sanitizeArtifactFilenameSegment, type GeneratedArtifactFile } from "../artifact.types";

// Phase D3 — same canonical dataset as the XLSX/DOCX/PDF renderers
// (collections-dataset.service.ts), turned into a real .pptx OOXML
// package. This is the one place pptxgenjs is imported. Everything this
// file does is visual/layout mechanics only:
//   dataset → buildCollectionsManagementSummary → buildCollectionsPresentationModel → slides
// Both builder calls are pure, synchronous, zero-I/O functions (see their
// own files) — this renderer never queries Prisma, never receives an org
// identifier, never aggregates records, never ranks customers, never
// computes a chart value, and never decides whether a slide is meaningful.
// Every number and every "should this slide exist" decision already
// happened before this file runs; this file only turns already-decided
// values into text runs, table cells, and native chart series.

const NA = "N/A";

function money(value: number): string {
  return value.toFixed(2);
}

function moneyOrNa(value: number | null): string {
  return value === null ? NA : money(value);
}

function addExecutiveSummarySlide(pptx: PptxGenJS, model: CollectionsPresentationModel): void {
  const slide = pptx.addSlide();
  slide.addText(model.title, { x: 0.5, y: 0.4, w: 12.3, h: 0.7, fontSize: 24, bold: true });
  slide.addText(`Dönem: ${model.period.label} (${model.period.isoLabel})`, { x: 0.5, y: 1.2, w: 12.3, h: 0.4, fontSize: 14, italic: true });
  slide.addText(`Toplam kayıt sayısı: ${model.recordCount}`, { x: 0.5, y: 1.65, w: 12.3, h: 0.4, fontSize: 14 });

  let y = 2.3;
  for (const currency of model.currencyPerformance) {
    slide.addText(`${currency.currency}`, { x: 0.5, y, w: 12.3, h: 0.35, fontSize: 16, bold: true });
    y += 0.4;
    slide.addText(`Net Tahsilat (${currency.currency}): ${money(currency.netCollections)}`, { x: 0.7, y, w: 12.1, h: 0.32, fontSize: 13 });
    y += 0.34;
    slide.addText(`Brüt Tahsilat (${currency.currency}): ${money(currency.grossCollections)}`, { x: 0.7, y, w: 12.1, h: 0.32, fontSize: 13 });
    y += 0.34;
    slide.addText(`İade/İptal (${currency.currency}): ${money(currency.reversals)}`, { x: 0.7, y, w: 12.1, h: 0.32, fontSize: 13 });
    y += 0.34;
    slide.addText(`İşlem sayısı (${currency.currency}): ${currency.eventCount}`, { x: 0.7, y, w: 12.1, h: 0.32, fontSize: 13 });
    y += 0.5;
  }
}

function performanceTableRows(currencyPerformance: readonly CollectionsCurrencyPerformance[]): PptxGenJS.TableRow[] {
  const header: PptxGenJS.TableRow = [
    { text: "Para Birimi", options: { bold: true } },
    { text: "Brüt Tahsilat", options: { bold: true } },
    { text: "İade/İptal", options: { bold: true } },
    { text: "Net Tahsilat", options: { bold: true } },
    { text: "Pozitif Adet", options: { bold: true } },
    { text: "İade Adet", options: { bold: true } },
    { text: "Ortalama Pozitif", options: { bold: true } },
    { text: "En Büyük Pozitif", options: { bold: true } },
  ];
  const rows: PptxGenJS.TableRow[] = [header];
  for (const currency of currencyPerformance) {
    rows.push([
      { text: currency.currency },
      { text: money(currency.grossCollections) },
      { text: money(currency.reversals) },
      { text: money(currency.netCollections) },
      { text: String(currency.positiveCollectionCount) },
      { text: String(currency.reversalCount) },
      { text: moneyOrNa(currency.averagePositiveCollection) },
      { text: moneyOrNa(currency.largestPositiveCollection) },
    ]);
  }
  return rows;
}

function addCollectionPerformanceSlide(pptx: PptxGenJS, model: CollectionsPresentationModel): void {
  const slide = pptx.addSlide();
  slide.addText("Tahsilat Performansı Detayı", { x: 0.5, y: 0.4, w: 12.3, h: 0.6, fontSize: 22, bold: true });
  slide.addTable(performanceTableRows(model.currencyPerformance), {
    x: 0.5, y: 1.2, w: 12.3,
    fontSize: 11,
    border: { type: "solid", color: "CFCFCF", pt: 0.5 },
  });
}

function addDailyTrendSlide(pptx: PptxGenJS, chart: CollectionsDailyChartSeries): void {
  const slide = pptx.addSlide();
  slide.addText(`Günlük Trend (${chart.currency})`, { x: 0.5, y: 0.4, w: 12.3, h: 0.6, fontSize: 22, bold: true });
  slide.addChart(
    pptx.ChartType.line,
    [{ name: `Net Tahsilat (${chart.currency})`, labels: [...chart.labels], values: [...chart.values] }],
    { x: 0.5, y: 1.2, w: 12.3, h: 5.6 },
  );
}

function topCustomersTableRows(currency: string, rows: CollectionsTopCustomersSlide["rows"]): PptxGenJS.TableRow[] {
  const header: PptxGenJS.TableRow = [
    { text: "Müşteri", options: { bold: true } },
    { text: `Net Tahsilat (${currency})`, options: { bold: true } },
  ];
  return [header, ...rows.map((row): PptxGenJS.TableRow => [
    { text: row.customerName },
    { text: money(row.netAmount) },
  ])];
}

function addTopCustomersSlide(pptx: PptxGenJS, entry: CollectionsTopCustomersSlide): void {
  const slide = pptx.addSlide();
  slide.addText(`En Çok Tahsilat Yapılan Müşteriler (${entry.currency})`, { x: 0.5, y: 0.4, w: 12.3, h: 0.6, fontSize: 22, bold: true });
  slide.addTable(topCustomersTableRows(entry.currency, entry.rows), {
    x: 0.5, y: 1.2, w: 12.3,
    fontSize: 12,
    border: { type: "solid", color: "CFCFCF", pt: 0.5 },
  });
}

export async function renderCollectionsPptx(dataset: CollectionsDataset): Promise<GeneratedArtifactFile> {
  const summary = buildCollectionsManagementSummary(dataset);
  const model = buildCollectionsPresentationModel(dataset, summary);

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "METRIX";
  pptx.title = model.title;

  addExecutiveSummarySlide(pptx, model);
  addCollectionPerformanceSlide(pptx, model);
  for (const chart of model.dailyCharts) addDailyTrendSlide(pptx, chart);
  for (const topCustomers of model.topCustomerSlides) addTopCustomersSlide(pptx, topCustomers);

  const output = await pptx.write({ outputType: "nodebuffer" });
  const filename = `tahsilatlar-${sanitizeArtifactFilenameSegment(dataset.period.isoLabel)}.pptx`;
  return {
    format: "pptx",
    filename,
    mimeType: ARTIFACT_MIME_TYPES.pptx,
    content: Buffer.from(output as Uint8Array),
  };
}
