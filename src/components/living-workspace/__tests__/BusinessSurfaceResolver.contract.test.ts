import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/living-workspace/BusinessSurfaceResolver.tsx"), "utf8");

describe("BusinessSurfaceResolver contract", () => {
  it("resolves Customer create to the existing living presentation", () => {
    expect(source).toContain('directive.businessSurface === "customer-create"');
    expect(source).toContain('<CustomerCreateScreen presentation="living"/>');
  });

  it("preserves the intentional Customer edit and detail edit-runtime behavior", () => {
    expect(source).toContain('directive.businessSurface === "customer-edit" || directive.businessSurface === "customer-detail"');
    expect(source).toContain('<CustomerEditScreen customerId={directive.entityId} presentation="living"/>');
  });

  it("returns null for unsupported real surfaces so the host can use its generic fallback", () => {
    expect(source).toMatch(/return null;\s*\}/u);
  });

  it("keeps Customer authority-key projection out of the generic host", () => {
    expect(source).toContain('"customers.list.page"');
    expect(source).toContain('"customers.detail.page"');
  });
});
