import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RENDERER_FILES = [
  "../renderers/collections-xlsx-renderer.ts",
  "../renderers/collections-docx-renderer.ts",
  "../renderers/collections-pdf-renderer.ts",
  "../renderers/collections-pptx-renderer.ts",
];

// Phase D3 — the deterministic layers a PPTX renderer needs before it can
// turn numbers into slides. Same no-independent-business-authority
// contract as the renderers themselves.
const SUMMARY_AND_PRESENTATION_MODEL_FILES = [
  "../datasets/collections-management-summary.service.ts",
  "../presentation/collections-presentation-model.service.ts",
];

const ALL_D3_PURE_LAYER_FILES = [...RENDERER_FILES, ...SUMMARY_AND_PRESENTATION_MODEL_FILES];

// Phase D2, section 16 (extended by Phase D3, item J): a renderer — and, as
// of D3, the management-summary and presentation-model layers a renderer
// may compose — must never query Prisma, never query Settlement/Payment
// directly, never receive an organizationId, never mutate data, never call
// external research, and never call an LLM. Only the existing canonical
// artifact/business orchestration (collections-dataset.service.ts →
// settlement.service.ts) may retrieve the dataset — everything downstream
// of it receives already-resolved values and nothing else.
describe("collections renderers — no independent business query authority", () => {
  it.each(RENDERER_FILES)("%s never imports Prisma or any business-data service", (relativePath) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    expect(source).not.toContain("@/lib/core/shared/prisma");
    expect(source).not.toContain("@/lib/core/settlements");
    expect(source).not.toContain("@/lib/core/payments");
    expect(source).not.toContain("organizationId");
    expect(source).not.toMatch(/\.(create|update|delete|upsert)\(/);
  });

  it.each(RENDERER_FILES)("%s takes only a CollectionsDataset as input — no query parameters", (relativePath) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    expect(source).toMatch(/\(dataset: CollectionsDataset\)/);
  });
});

describe("Phase D3 — summary/presentation-model layers have no independent business query authority", () => {
  it.each(SUMMARY_AND_PRESENTATION_MODEL_FILES)("%s never imports Prisma or any business-data service, never receives an organizationId", (relativePath) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    expect(source).not.toContain("@/lib/core/shared/prisma");
    expect(source).not.toContain("@/lib/core/settlements");
    expect(source).not.toContain("@/lib/core/payments");
    expect(source).not.toContain("organizationId");
    expect(source).not.toMatch(/\.(create|update|delete|upsert)\(/);
  });

  it.each(ALL_D3_PURE_LAYER_FILES)("%s never calls external research or an LLM provider", (relativePath) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    expect(source).not.toContain("@/lib/ai/external-evidence");
    expect(source).not.toContain("@/lib/ai/providers");
    expect(source).not.toContain("openai");
    expect(source).not.toMatch(/\bawait\s+fetch\(/);
  });

  it("collections-presentation-model.service.ts never imports pptxgenjs (renderer-independent)", () => {
    const source = readFileSync(new URL("../presentation/collections-presentation-model.service.ts", import.meta.url), "utf8");
    expect(source).not.toContain("pptxgenjs");
  });

  it("collections-pptx-renderer.ts is the only D3 file that imports pptxgenjs", () => {
    for (const relativePath of SUMMARY_AND_PRESENTATION_MODEL_FILES) {
      const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
      expect(source).not.toContain("pptxgenjs");
    }
    const rendererSource = readFileSync(new URL("../renderers/collections-pptx-renderer.ts", import.meta.url), "utf8");
    expect(rendererSource).toContain("pptxgenjs");
  });
});
