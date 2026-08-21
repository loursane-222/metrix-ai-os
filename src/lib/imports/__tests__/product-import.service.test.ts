import { describe, expect, it, vi } from "vitest";

const listProductServices = vi.fn();
vi.mock("@/lib/core/products/product.service", () => ({ listProductServices: (...args: unknown[]) => listProductServices(...args) }));

const { previewProductImport, buildPropositionsFromReviewedRows } = await import("../product-import.service");

describe("previewProductImport", () => {
  it("skips rows with no name after mapping", async () => {
    listProductServices.mockResolvedValue([]);
    const preview = await previewProductImport({
      organizationId: "org1",
      headers: ["Ürün Adı", "Birim"],
      rows: [{ "Ürün Adı": "", "Birim": "Adet" }, { "Ürün Adı": "Çelik Profil", "Birim": "Adet" }],
    });
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]!.values.name).toBe("Çelik Profil");
    expect(preview.totalRows).toBe(2);
  });

  it("excludes a row whose name matches an existing active product, case-insensitively", async () => {
    listProductServices.mockResolvedValue([{ id: "p1", name: "Çelik Profil", status: "ACTIVE" }]);
    const preview = await previewProductImport({
      organizationId: "org1",
      headers: ["Ürün Adı"],
      rows: [{ "Ürün Adı": "ÇELİK PROFİL" }],
    });
    expect(preview.rows[0]!.excluded).toBe(true);
    expect(preview.rows[0]!.duplicates).toEqual([{ productId: "p1", name: "Çelik Profil" }]);
    expect(preview.duplicateCount).toBe(1);
  });

  it("does not match against an archived product", async () => {
    listProductServices.mockResolvedValue([{ id: "p1", name: "Çelik Profil", status: "ARCHIVED" }]);
    const preview = await previewProductImport({
      organizationId: "org1",
      headers: ["Ürün Adı"],
      rows: [{ "Ürün Adı": "Çelik Profil" }],
    });
    expect(preview.rows[0]!.excluded).toBe(false);
    expect(preview.duplicateCount).toBe(0);
  });

  it("normalizes a Turkish type column to the canonical PRODUCT/SERVICE literal", async () => {
    listProductServices.mockResolvedValue([]);
    const preview = await previewProductImport({
      organizationId: "org1",
      headers: ["Ürün Adı", "Tür"],
      rows: [{ "Ürün Adı": "Danışmanlık", "Tür": "Hizmet" }, { "Ürün Adı": "Çelik Profil", "Tür": "Ürün" }],
    });
    expect(preview.rows[0]!.values.type).toBe("SERVICE");
    expect(preview.rows[1]!.values.type).toBe("PRODUCT");
  });
});

describe("buildPropositionsFromReviewedRows (products)", () => {
  it("builds one CREATE proposition per included row with bare field paths", () => {
    const propositions = buildPropositionsFromReviewedRows([
      { rowIndex: 0, values: { name: "Çelik Profil", unit: "Adet" }, duplicates: [], excluded: false },
      { rowIndex: 1, values: { name: "Skip Me" }, duplicates: [{ productId: "p1", name: "Skip Me" }], excluded: true },
    ]);
    expect(propositions).toHaveLength(1);
    expect(propositions[0]!.targetDomain).toBe("ProductService");
    expect(propositions[0]!.operation).toBe("CREATE");
    expect(propositions[0]!.entityResolutionStatus).toBe("NEW_ENTITY");
    expect(propositions[0]!.changes).toEqual([
      { fieldPath: "name", proposedValue: "Çelik Profil" },
      { fieldPath: "unit", proposedValue: "Adet" },
    ]);
  });
});
