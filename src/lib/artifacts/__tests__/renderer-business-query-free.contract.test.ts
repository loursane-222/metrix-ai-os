import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RENDERER_FILES = [
  "../renderers/collections-xlsx-renderer.ts",
  "../renderers/collections-docx-renderer.ts",
  "../renderers/collections-pdf-renderer.ts",
];

// Phase D2, section 16: the renderer must never query Prisma, never query
// Settlement/Payment directly, never receive an organizationId, and never
// mutate data. Only the existing canonical artifact/business orchestration
// (collections-dataset.service.ts → settlement.service.ts) may retrieve the
// dataset — a renderer receives an already-resolved CollectionsDataset
// object and nothing else.
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
