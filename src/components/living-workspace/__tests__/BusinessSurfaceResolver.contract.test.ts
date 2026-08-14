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
    expect(source).toContain('<CustomerEditScreen customerId={directive.entityId} onSurfaceFailure={readiness?.onFailure} onSurfaceReady={readiness?.onReady} presentation="living"/>');
  });

  it("resolves Supplier detail to the real edit surface", () => {
    expect(source).toContain('directive.businessSurface === "supplier-detail"');
    expect(source).toContain('<SupplierEditSurface supplierId={directive.entityId}');
    expect(source).toContain('"suppliers.detail.page"');
  });

  it("resolves Invoice detail to the real action surface", () => {
    expect(source).toContain('directive.businessSurface === "invoice-list" && directive.entityId');
    expect(source).toContain('<InvoiceActionSurface invoiceId={directive.entityId}');
    expect(source).toContain('"invoices.detail.page"');
  });

  it("returns null for unsupported real surfaces so the host can use its generic fallback", () => {
    expect(source).toMatch(/return null;\s*\}/u);
  });

  it("keeps Customer authority-key projection out of the generic host", () => {
    expect(source).toContain('"customers.list.page"');
    expect(source).toContain('"customers.detail.page"');
    expect(source).toContain('"customers.customer.create"');
  });
});
