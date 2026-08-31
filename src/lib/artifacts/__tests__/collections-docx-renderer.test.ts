import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { renderCollectionsDocx } from "../renderers/collections-docx-renderer";
import type { CollectionsDataset } from "../datasets/collections-dataset.service";

// Proves real generation, not a mock: the renderer's output buffer is
// unzipped (a real .docx IS a ZIP+OOXML package) and word/document.xml is
// inspected for the actual literal text content — a genuine semantic
// read-back, not a binary-byte comparison (Phase D2, section 18).
function sampleDataset(): CollectionsDataset {
  return Object.freeze({
    period: { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z"), label: "Ağustos 2026", isoLabel: "2026-08" },
    records: [
      { occurredAt: new Date("2026-08-05T00:00:00Z"), customerName: "Atlas İnşaat", title: "Ağustos tahsilatı", amount: 3000, currency: "TRY", invoiceNumber: "INV-001", kind: "ORIGINAL" as const },
      { occurredAt: new Date("2026-08-15T00:00:00Z"), customerName: "Atlas İnşaat", title: "Ağustos tahsilatı", amount: -3000, currency: "TRY", invoiceNumber: null, kind: "REVERSAL" as const },
    ],
    recordCount: 2,
    totalsByCurrency: { TRY: 0 },
  });
}

describe("renderCollectionsDocx — real generation + semantic read-back", () => {
  it("produces a real, valid DOCX package with the expected title/period/count/totals/rows", async () => {
    const dataset = sampleDataset();
    const file = await renderCollectionsDocx(dataset);

    expect(file.format).toBe("docx");
    expect(file.filename).toBe("tahsilatlar-2026-08.docx");
    expect(file.mimeType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(file.content.byteLength).toBeGreaterThan(0);

    const zip = await JSZip.loadAsync(file.content);
    // A real DOCX package always has these — proves this is genuinely a
    // valid OOXML wordprocessing document, not an arbitrary buffer.
    expect(zip.file("[Content_Types].xml")).not.toBeNull();
    const documentXmlFile = zip.file("word/document.xml");
    expect(documentXmlFile).not.toBeNull();
    const xml = await documentXmlFile!.async("string");

    expect(xml).toContain("Tahsilat Raporu");
    expect(xml).toContain("Ağustos 2026");
    expect(xml).toContain("2026-08");
    expect(xml).toContain("Kayıt say");
    expect(xml).toContain("2");
    expect(xml).toContain("Atlas");
    expect(xml).toContain("3000.00");
    expect(xml).toContain("-3000.00");
    expect(xml).toContain("İade");
    expect(xml).toContain("Tahsilat");
    // Net total for a same-period reversal is zero — never a fabricated
    // non-zero number.
    expect(xml).toContain("Toplam (TRY): 0.00");
  });

  it("never fabricates a row for a zero-record dataset", async () => {
    const dataset: CollectionsDataset = {
      period: { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z"), label: "Ağustos 2026", isoLabel: "2026-08" },
      records: [],
      recordCount: 0,
      totalsByCurrency: {},
    };
    const file = await renderCollectionsDocx(dataset);
    const zip = await JSZip.loadAsync(file.content);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Kayıt say");
    expect(xml).toContain("Bu dönem için kayıtlı tahsilat yok");
  });
});
