import ExcelJS from "exceljs";
import JSZip from "jszip";
import { PDFParse } from "pdf-parse";
import { describe, expect, it, vi } from "vitest";
import { renderCollectionsXlsx } from "../renderers/collections-xlsx-renderer";
import { renderCollectionsDocx } from "../renderers/collections-docx-renderer";
import { renderCollectionsPdf } from "../renderers/collections-pdf-renderer";

// buildCollectionsArtifactPromptLine is a pure function (no DB access), but
// collections-artifact.service.ts's module graph transitively reaches
// settlement.service.ts → prisma.ts, which throws at import time without a
// configured DATABASE_URL. Stub the one module in that chain this test
// never actually calls, purely to keep the import graph DB-free — the
// renderers under test here take a dataset object directly and never touch
// this chain themselves (see the tenant-isolation/query-free structural
// tests for that guarantee).
vi.mock("../datasets/collections-dataset.service", () => ({ buildCollectionsDataset: vi.fn() }));

const { buildCollectionsArtifactPromptLine } = await import("../collections-artifact.service");
import type { CollectionsDataset } from "../datasets/collections-dataset.service";

// Phase D2, section 20 — one CollectionsDataset, three renderers, one
// narration builder: all four must reconcile on period, recordCount,
// totalsByCurrency, event dates, signed amounts, and reversal semantics.
// Visual presentation may differ; the truth may not.
const dataset: CollectionsDataset = Object.freeze({
  period: { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z"), label: "Ağustos 2026", isoLabel: "2026-08" },
  records: [
    { occurredAt: new Date("2026-08-03T00:00:00Z"), customerName: "Atlas Insaat", title: "Ilk tahsilat", amount: 3000, currency: "TRY", invoiceNumber: "INV-001", kind: "ORIGINAL" as const },
    { occurredAt: new Date("2026-08-22T00:00:00Z"), customerName: "Deneme Firmasi", title: "Ikinci tahsilat", amount: 1500, currency: "TRY", invoiceNumber: null, kind: "ORIGINAL" as const },
    { occurredAt: new Date("2026-08-25T00:00:00Z"), customerName: "Deneme Firmasi", title: "Iade", amount: -500, currency: "TRY", invoiceNumber: null, kind: "REVERSAL" as const },
  ],
  recordCount: 3,
  totalsByCurrency: { TRY: 4000 },
});

describe("cross-format artifact truth — XLSX/DOCX/PDF/narration reconcile on the same dataset", () => {
  it("all three renderers and the narration line agree on period, count, and total", async () => {
    const xlsxFile = await renderCollectionsXlsx(dataset);
    const docxFile = await renderCollectionsDocx(dataset);
    const pdfFile = await renderCollectionsPdf(dataset);
    const narration = buildCollectionsArtifactPromptLine({ status: "GENERATED", dataset, file: xlsxFile });

    // XLSX read-back
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsxFile.content as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Tahsilatlar")!;
    let xlsxTotal: number | null = null;
    sheet.eachRow((row) => {
      if (row.getCell(1).value === "Toplam (TRY):") xlsxTotal = row.getCell(2).value as number;
    });

    // DOCX read-back
    const zip = await JSZip.loadAsync(docxFile.content);
    const docxXml = await zip.file("word/document.xml")!.async("string");

    // PDF read-back
    const pdfParser = new PDFParse({ data: new Uint8Array(pdfFile.content) });
    const pdfText = (await pdfParser.getText()).text;

    // Period
    for (const content of [docxXml, pdfText]) expect(content).toContain(dataset.period.isoLabel);
    // Record count
    expect(docxXml).toContain(`${dataset.recordCount}`);
    expect(pdfText).toContain(`Kayıt sayısı: ${dataset.recordCount}`);
    // Total
    expect(xlsxTotal).toBe(dataset.totalsByCurrency.TRY);
    expect(docxXml).toContain(`${dataset.totalsByCurrency.TRY!.toFixed(2)}`);
    expect(pdfText).toContain(`Toplam (TRY): ${dataset.totalsByCurrency.TRY!.toFixed(2)}`);
    expect(narration).toContain(`${dataset.recordCount} kayıt`);
    expect(narration).toContain(`${dataset.totalsByCurrency.TRY} TRY`);

    // Every event's signed amount and date appears in every format.
    for (const record of dataset.records) {
      const amountText = record.amount.toFixed(2);
      const dateText = record.occurredAt.toISOString().slice(0, 10);
      expect(docxXml).toContain(amountText);
      expect(pdfText).toContain(amountText);
      expect(docxXml).toContain(dateText);
      expect(pdfText).toContain(dateText);
    }

    // Reversal semantics: the REVERSAL row's negative sign and label
    // survive identically in every format.
    expect(docxXml).toContain("-500.00");
    expect(docxXml).toContain("İade/İptal");
    expect(pdfText).toContain("-500.00");
    expect(pdfText).toContain("İade");
  });
});
