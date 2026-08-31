import { beforeEach, describe, expect, it, vi } from "vitest";

const buildCollectionsDataset = vi.hoisted(() => vi.fn());
const renderCollectionsXlsx = vi.hoisted(() => vi.fn());
vi.mock("../datasets/collections-dataset.service", () => ({ buildCollectionsDataset }));
vi.mock("../renderers/collections-xlsx-renderer", () => ({ renderCollectionsXlsx }));

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

describe("generateCollectionsArtifact — outcome contract", () => {
  beforeEach(() => {
    buildCollectionsDataset.mockReset();
    renderCollectionsXlsx.mockReset();
  });

  it("returns GENERATED with the real file when the dataset has records and rendering succeeds", async () => {
    buildCollectionsDataset.mockResolvedValueOnce(dataset);
    renderCollectionsXlsx.mockResolvedValueOnce({ format: "xlsx", filename: "tahsilatlar-2026-08.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content: Buffer.from("x") });
    const outcome = await generateCollectionsArtifact("org-1", "Europe/Istanbul");
    expect(outcome.status).toBe("GENERATED");
  });

  it("returns EMPTY, never a file, when the dataset has zero records", async () => {
    buildCollectionsDataset.mockResolvedValueOnce({ ...dataset, records: [], recordCount: 0, totalsByCurrency: {} });
    const outcome = await generateCollectionsArtifact("org-1", "Europe/Istanbul");
    expect(outcome.status).toBe("EMPTY");
    expect(renderCollectionsXlsx).not.toHaveBeenCalled();
  });

  it("returns FAILED with query_failed when the canonical dataset query throws", async () => {
    buildCollectionsDataset.mockRejectedValueOnce(new Error("db unavailable"));
    const outcome = await generateCollectionsArtifact("org-1", "Europe/Istanbul");
    expect(outcome).toMatchObject({ status: "FAILED", reason: "query_failed" });
  });

  it("returns FAILED with render_failed when the renderer throws, without ever claiming success", async () => {
    buildCollectionsDataset.mockResolvedValueOnce(dataset);
    renderCollectionsXlsx.mockRejectedValueOnce(new Error("workbook write error"));
    const outcome = await generateCollectionsArtifact("org-1", "Europe/Istanbul");
    expect(outcome).toMatchObject({ status: "FAILED", reason: "render_failed" });
  });
});

describe("buildCollectionsArtifactPromptLine — honesty contract", () => {
  it("on GENERATED, states the exact dataset count/total and never a different number", () => {
    const line = buildCollectionsArtifactPromptLine({ status: "GENERATED", dataset, file: { format: "xlsx", filename: "x.xlsx", mimeType: "x", content: Buffer.from("") } });
    expect(line).toContain("1 kayıt");
    expect(line).toContain("15000 TRY");
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
});
