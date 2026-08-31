import { PDFParse } from "pdf-parse";
import { describe, expect, it } from "vitest";
import { renderCollectionsPdf } from "../renderers/collections-pdf-renderer";
import type { CollectionsDataset } from "../datasets/collections-dataset.service";

// Proves real generation, not a mock: the renderer's output buffer is fed
// into a real PDF parser (pdf.js-based) and the actual extracted text is
// inspected — a genuine semantic read-back, not a binary-byte comparison or
// OCR/screenshot (Phase D2, section 19).
function sampleDataset(): CollectionsDataset {
  return Object.freeze({
    period: { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z"), label: "Ağustos 2026", isoLabel: "2026-08" },
    records: [
      { occurredAt: new Date("2026-08-05T00:00:00Z"), customerName: "Atlas Insaat", title: "Agustos tahsilati", amount: 3000, currency: "TRY", invoiceNumber: "INV-001", kind: "ORIGINAL" as const },
      { occurredAt: new Date("2026-08-15T00:00:00Z"), customerName: "Atlas Insaat", title: "Agustos tahsilati", amount: -3000, currency: "TRY", invoiceNumber: null, kind: "REVERSAL" as const },
    ],
    recordCount: 2,
    totalsByCurrency: { TRY: 0 },
  });
}

describe("renderCollectionsPdf — real generation + semantic read-back", () => {
  it("produces a real, parseable PDF with the expected title/period/count/totals/rows", async () => {
    const dataset = sampleDataset();
    const file = await renderCollectionsPdf(dataset);

    expect(file.format).toBe("pdf");
    expect(file.filename).toBe("tahsilatlar-2026-08.pdf");
    expect(file.mimeType).toBe("application/pdf");
    expect(file.content.byteLength).toBeGreaterThan(0);
    // A real PDF file always starts with this magic header.
    expect(file.content.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const parser = new PDFParse({ data: new Uint8Array(file.content) });
    const result = await parser.getText();

    expect(result.text).toContain("Tahsilat Raporu");
    expect(result.text).toContain("Ağustos 2026");
    expect(result.text).toContain("2026-08");
    expect(result.text).toContain("Kayıt sayısı: 2");
    expect(result.text).toContain("Atlas Insaat");
    expect(result.text).toContain("3000.00");
    expect(result.text).toContain("-3000.00");
    expect(result.text).toContain("İade");
    expect(result.text).toContain("Tahsilat");
    expect(result.text).toContain("Toplam (TRY): 0.00");
  });

  it("never fabricates a row for a zero-record dataset", async () => {
    const dataset: CollectionsDataset = {
      period: { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z"), label: "Ağustos 2026", isoLabel: "2026-08" },
      records: [],
      recordCount: 0,
      totalsByCurrency: {},
    };
    const file = await renderCollectionsPdf(dataset);
    const parser = new PDFParse({ data: new Uint8Array(file.content) });
    const result = await parser.getText();
    expect(result.text).toContain("Kayıt sayısı: 0");
    expect(result.text).toContain("kayıtlı tahsilat yok");
  });

  it("paginates across multiple pages when row count exceeds one page", async () => {
    const manyRecords = Array.from({ length: 60 }, (_, i) => ({
      occurredAt: new Date(`2026-08-${String((i % 27) + 1).padStart(2, "0")}T00:00:00Z`),
      customerName: `Customer ${i}`,
      title: "Tahsilat",
      amount: 100 + i,
      currency: "TRY",
      invoiceNumber: null,
      kind: "ORIGINAL" as const,
    }));
    const dataset: CollectionsDataset = {
      period: { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z"), label: "Ağustos 2026", isoLabel: "2026-08" },
      records: manyRecords,
      recordCount: manyRecords.length,
      totalsByCurrency: { TRY: manyRecords.reduce((sum, r) => sum + r.amount, 0) },
    };
    const file = await renderCollectionsPdf(dataset);
    const parser = new PDFParse({ data: new Uint8Array(file.content) });
    const result = await parser.getText();
    expect(result.total).toBeGreaterThan(1);
    expect(result.text).toContain("Customer 0");
    expect(result.text).toContain("Customer 59");
  });
});
