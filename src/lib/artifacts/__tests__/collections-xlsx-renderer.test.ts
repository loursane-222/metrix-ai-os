import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { renderCollectionsXlsx } from "../renderers/collections-xlsx-renderer";
import type { CollectionsDataset } from "../datasets/collections-dataset.service";

// Proves real generation, not a mock: the renderer's output buffer is fed
// back into a fresh ExcelJS.Workbook().xlsx.load() — a genuine XLSX parse,
// not a binary-byte comparison (Phase D1, section 19-J / section 20).
function sampleDataset(): CollectionsDataset {
  return Object.freeze({
    period: { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z"), label: "Ağustos 2026", isoLabel: "2026-08" },
    records: [
      { occurredAt: new Date("2026-08-05T00:00:00Z"), customerName: "Atlas İnşaat", title: "Ağustos ayı tahsilatı", amount: 15000, currency: "TRY", invoiceNumber: "INV-001", kind: "ORIGINAL" as const },
      { occurredAt: new Date("2026-08-20T00:00:00Z"), customerName: "Deneme Firması", title: "Kısmi ödeme", amount: 32840.5, currency: "TRY", invoiceNumber: null, kind: "ORIGINAL" as const },
    ],
    recordCount: 2,
    totalsByCurrency: { TRY: 47840.5 },
  });
}

// Column order from sheet.columns: 1=Tarih 2=Müşteri 3=Açıklama 4=Fatura No 5=Tür 6=Tutar 7=Para Birimi.
describe("renderCollectionsXlsx — real generation + read-back", () => {
  it("produces a real, parseable XLSX with the exact canonical rows and correct cell types", async () => {
    const dataset = sampleDataset();
    const file = await renderCollectionsXlsx(dataset);

    expect(file.format).toBe("xlsx");
    expect(file.filename).toBe("tahsilatlar-2026-08.xlsx");
    expect(file.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(file.content.byteLength).toBeGreaterThan(0);

    const readBack = new ExcelJS.Workbook();
    await readBack.xlsx.load(file.content as unknown as ArrayBuffer);
    const sheet = readBack.getWorksheet("Tahsilatlar");
    expect(sheet).toBeDefined();

    const headerRow = sheet!.getRow(1).values as unknown[];
    expect(headerRow).toContain("Tarih");
    expect(headerRow).toContain("Müşteri");
    expect(headerRow).toContain("Tutar");

    const row1 = sheet!.getRow(2);
    expect(row1.getCell(2).value).toBe("Atlas İnşaat");
    expect(row1.getCell(6).value).toBe(15000);
    expect(typeof row1.getCell(6).value).toBe("number");
    // ExcelJS reads a date-typed cell back as a real Date instance, not a string.
    expect(row1.getCell(1).value).toBeInstanceOf(Date);
    expect(row1.getCell(5).value).toBe("Tahsilat");

    const row2 = sheet!.getRow(3);
    expect(row2.getCell(2).value).toBe("Deneme Firması");
    expect(row2.getCell(6).value).toBe(32840.5);
  });

  it("reconciles the workbook's own total cell with the dataset's deterministic total — never a recomputed/divergent number", async () => {
    const dataset = sampleDataset();
    const file = await renderCollectionsXlsx(dataset);

    const readBack = new ExcelJS.Workbook();
    await readBack.xlsx.load(file.content as unknown as ArrayBuffer);
    const sheet = readBack.getWorksheet("Tahsilatlar")!;

    let foundTotal: number | null = null;
    sheet.eachRow((row) => {
      if (row.getCell(1).value === "Toplam (TRY):") foundTotal = row.getCell(2).value as number;
    });
    expect(foundTotal).toBe(dataset.totalsByCurrency.TRY);
  });

  it("renders a REVERSAL event as its own distinct, negatively-signed row — never silently dropped or merged", async () => {
    const dataset: CollectionsDataset = {
      period: { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z"), label: "Ağustos 2026", isoLabel: "2026-08" },
      records: [
        { occurredAt: new Date("2026-08-05T00:00:00Z"), customerName: "Atlas İnşaat", title: "Ağustos tahsilatı", amount: 3000, currency: "TRY", invoiceNumber: null, kind: "ORIGINAL" },
        { occurredAt: new Date("2026-08-12T00:00:00Z"), customerName: "Atlas İnşaat", title: "Ağustos tahsilatı", amount: -3000, currency: "TRY", invoiceNumber: null, kind: "REVERSAL" },
      ],
      recordCount: 2,
      totalsByCurrency: { TRY: 0 },
    };
    const file = await renderCollectionsXlsx(dataset);
    const readBack = new ExcelJS.Workbook();
    await readBack.xlsx.load(file.content as unknown as ArrayBuffer);
    const sheet = readBack.getWorksheet("Tahsilatlar")!;

    expect(sheet.getRow(2).getCell(6).value).toBe(3000);
    expect(sheet.getRow(2).getCell(5).value).toBe("Tahsilat");
    expect(sheet.getRow(3).getCell(6).value).toBe(-3000);
    expect(sheet.getRow(3).getCell(5).value).toBe("İade/İptal");

    let foundTotal: number | null = null;
    sheet.eachRow((row) => {
      if (row.getCell(1).value === "Toplam (TRY):") foundTotal = row.getCell(2).value as number;
    });
    expect(foundTotal).toBe(0);
  });

  it("handles a zero-record dataset without inventing rows", async () => {
    const dataset: CollectionsDataset = {
      period: { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z"), label: "Ağustos 2026", isoLabel: "2026-08" },
      records: [],
      recordCount: 0,
      totalsByCurrency: {},
    };
    const file = await renderCollectionsXlsx(dataset);
    const readBack = new ExcelJS.Workbook();
    await readBack.xlsx.load(file.content as unknown as ArrayBuffer);
    const sheet = readBack.getWorksheet("Tahsilatlar")!;
    // Header only — row 2 (first data row) must be empty.
    expect(sheet.getRow(2).getCell(2).value).toBeNull();
  });
});
