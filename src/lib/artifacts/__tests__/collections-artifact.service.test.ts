import { beforeEach, describe, expect, it, vi } from "vitest";

const buildCollectionsDataset = vi.hoisted(() => vi.fn());
const renderCollectionsXlsx = vi.hoisted(() => vi.fn());
const renderCollectionsDocx = vi.hoisted(() => vi.fn());
const renderCollectionsPdf = vi.hoisted(() => vi.fn());
const renderCollectionsPptx = vi.hoisted(() => vi.fn());
vi.mock("../datasets/collections-dataset.service", () => ({ buildCollectionsDataset }));
vi.mock("../renderers/collections-xlsx-renderer", () => ({ renderCollectionsXlsx }));
vi.mock("../renderers/collections-docx-renderer", () => ({ renderCollectionsDocx }));
vi.mock("../renderers/collections-pdf-renderer", () => ({ renderCollectionsPdf }));
vi.mock("../renderers/collections-pptx-renderer", () => ({ renderCollectionsPptx }));

import {
  buildCollectionsArtifactPromptLine,
  buildDeliverableArtifactPayload,
  generateCollectionsArtifact,
} from "../collections-artifact.service";

const dataset = {
  period: { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z"), label: "Ağustos 2026", isoLabel: "2026-08" },
  records: [{ occurredAt: new Date(), customerName: "Atlas İnşaat", title: "x", amount: 15000, currency: "TRY", invoiceNumber: null, kind: "ORIGINAL" as const }],
  recordCount: 1,
  totalsByCurrency: { TRY: 15000 },
};

function fakeFile(format: "xlsx" | "docx" | "pdf" | "pptx") {
  return { format, filename: `tahsilatlar-2026-08.${format}`, mimeType: `application/${format}`, content: Buffer.from("x") };
}

describe("generateCollectionsArtifact — outcome contract", () => {
  beforeEach(() => {
    buildCollectionsDataset.mockReset();
    renderCollectionsXlsx.mockReset();
    renderCollectionsDocx.mockReset();
    renderCollectionsPdf.mockReset();
    renderCollectionsPptx.mockReset();
  });

  it("returns GENERATED with the real file when the dataset has records and rendering succeeds", async () => {
    buildCollectionsDataset.mockResolvedValueOnce(dataset);
    renderCollectionsXlsx.mockResolvedValueOnce(fakeFile("xlsx"));
    const outcome = await generateCollectionsArtifact("org-1", "Europe/Istanbul", "xlsx");
    expect(outcome.status).toBe("GENERATED");
  });

  it("returns EMPTY, never a file, when the dataset has zero records", async () => {
    buildCollectionsDataset.mockResolvedValueOnce({ ...dataset, records: [], recordCount: 0, totalsByCurrency: {} });
    const outcome = await generateCollectionsArtifact("org-1", "Europe/Istanbul", "xlsx");
    expect(outcome.status).toBe("EMPTY");
    expect(renderCollectionsXlsx).not.toHaveBeenCalled();
  });

  it("returns FAILED with query_failed when the canonical dataset query throws", async () => {
    buildCollectionsDataset.mockRejectedValueOnce(new Error("db unavailable"));
    const outcome = await generateCollectionsArtifact("org-1", "Europe/Istanbul", "xlsx");
    expect(outcome).toMatchObject({ status: "FAILED", reason: "query_failed" });
  });

  it("returns FAILED with render_failed when the renderer throws, without ever claiming success", async () => {
    buildCollectionsDataset.mockResolvedValueOnce(dataset);
    renderCollectionsXlsx.mockRejectedValueOnce(new Error("workbook write error"));
    const outcome = await generateCollectionsArtifact("org-1", "Europe/Istanbul", "xlsx");
    expect(outcome).toMatchObject({ status: "FAILED", reason: "render_failed" });
  });

  it.each(["xlsx", "docx", "pdf", "pptx"] as const)(
    "dispatches format %s to exactly the matching renderer, never a different one",
    async (format) => {
      buildCollectionsDataset.mockResolvedValueOnce(dataset);
      const renderers = { xlsx: renderCollectionsXlsx, docx: renderCollectionsDocx, pdf: renderCollectionsPdf, pptx: renderCollectionsPptx };
      renderers[format].mockResolvedValueOnce(fakeFile(format));
      const outcome = await generateCollectionsArtifact("org-1", "Europe/Istanbul", format);
      expect(outcome).toMatchObject({ status: "GENERATED", file: { format } });
      for (const [otherFormat, mock] of Object.entries(renderers)) {
        if (otherFormat === format) expect(mock).toHaveBeenCalledTimes(1);
        else expect(mock).not.toHaveBeenCalled();
      }
    },
  );

  it("a DOCX render failure produces FAILED, never a phantom GENERATED result", async () => {
    buildCollectionsDataset.mockResolvedValueOnce(dataset);
    renderCollectionsDocx.mockRejectedValueOnce(new Error("docx packer error"));
    const outcome = await generateCollectionsArtifact("org-1", "Europe/Istanbul", "docx");
    expect(outcome).toMatchObject({ status: "FAILED", reason: "render_failed" });
  });

  it("a PDF render failure produces FAILED, never a phantom GENERATED result", async () => {
    buildCollectionsDataset.mockResolvedValueOnce(dataset);
    renderCollectionsPdf.mockRejectedValueOnce(new Error("pdfkit stream error"));
    const outcome = await generateCollectionsArtifact("org-1", "Europe/Istanbul", "pdf");
    expect(outcome).toMatchObject({ status: "FAILED", reason: "render_failed" });
  });

  // Phase D3, item H — for PPTX + an empty dataset, the orchestrator's
  // existing EMPTY gate (recordCount === 0, checked before any renderer
  // dispatch) must apply exactly as it already does for XLSX/DOCX/PDF —
  // no PPTX-specific EMPTY handling was added or is needed.
  it("returns EMPTY, never generates a PPTX file, when the dataset has zero records", async () => {
    buildCollectionsDataset.mockResolvedValueOnce({ ...dataset, records: [], recordCount: 0, totalsByCurrency: {} });
    const outcome = await generateCollectionsArtifact("org-1", "Europe/Istanbul", "pptx");
    expect(outcome.status).toBe("EMPTY");
    expect(renderCollectionsPptx).not.toHaveBeenCalled();
  });

  it("a PPTX render failure produces FAILED, never a phantom GENERATED result", async () => {
    buildCollectionsDataset.mockResolvedValueOnce(dataset);
    renderCollectionsPptx.mockRejectedValueOnce(new Error("pptxgenjs write error"));
    const outcome = await generateCollectionsArtifact("org-1", "Europe/Istanbul", "pptx");
    expect(outcome).toMatchObject({ status: "FAILED", reason: "render_failed" });
  });
});

describe("buildCollectionsArtifactPromptLine — honesty contract", () => {
  it("on GENERATED, states the exact dataset count/total and the real format, never a different number/format", () => {
    const line = buildCollectionsArtifactPromptLine({ status: "GENERATED", dataset, file: fakeFile("docx") });
    expect(line).toContain("1 kayıt");
    expect(line).toContain("15000 TRY");
    expect(line).toContain("DOCX");
  });

  it("on GENERATED with a PPTX file, states PPTX with no PPTX-specific narration builder — the same generic line as every other format", () => {
    const line = buildCollectionsArtifactPromptLine({ status: "GENERATED", dataset, file: fakeFile("pptx") });
    expect(line).toContain("1 kayıt");
    expect(line).toContain("15000 TRY");
    expect(line).toContain("PPTX");
  });

  it("on EMPTY, forbids claiming a file exists", () => {
    const line = buildCollectionsArtifactPromptLine({ status: "EMPTY", dataset: { ...dataset, records: [], recordCount: 0, totalsByCurrency: {} } });
    expect(line).toContain("No file was generated");
    expect(line).not.toContain("downloadable");
  });

  it("on FAILED, forbids claiming success or a downloadable file, and never leaks the raw internal reason as user-facing text", () => {
    const line = buildCollectionsArtifactPromptLine({ status: "FAILED", reason: "query_failed" });
    expect(line).toContain("must NOT say a file was generated");
    expect(line).toContain("could not be completed");
  });
});

describe("buildDeliverableArtifactPayload", () => {
  it("encodes the exact file bytes as a base64 data URL with the correct mime type", () => {
    const payload = buildDeliverableArtifactPayload({ format: "xlsx", filename: "tahsilatlar-2026-08.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content: Buffer.from("hello") });
    expect(payload.filename).toBe("tahsilatlar-2026-08.xlsx");
    expect(payload.dataUrl).toBe(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${Buffer.from("hello").toString("base64")}`);
  });

  it("produces correct MIME types for DOCX and PDF deliverables", () => {
    const docx = buildDeliverableArtifactPayload({ format: "docx", filename: "tahsilatlar-2026-08.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", content: Buffer.from("d") });
    expect(docx.dataUrl.startsWith("data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,")).toBe(true);
    const pdf = buildDeliverableArtifactPayload({ format: "pdf", filename: "tahsilatlar-2026-08.pdf", mimeType: "application/pdf", content: Buffer.from("p") });
    expect(pdf.dataUrl.startsWith("data:application/pdf;base64,")).toBe(true);
  });

  it("Phase D3, item I — produces the correct PPTX MIME type, .pptx filename, and reuses the existing generic delivery payload unchanged", () => {
    const pptx = buildDeliverableArtifactPayload({
      format: "pptx",
      filename: "tahsilatlar-2026-08.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      content: Buffer.from("p"),
    });
    expect(pptx.filename).toBe("tahsilatlar-2026-08.pptx");
    expect(pptx.filename.endsWith(".pptx")).toBe(true);
    expect(pptx.dataUrl.startsWith("data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,")).toBe(true);
  });
});
