import { describe, expect, it, vi } from "vitest";

const listProductServices = vi.fn();
const listWarehousesForOrganization = vi.fn();
vi.mock("@/lib/core/products/product.service", () => ({ listProductServices: (...args: unknown[]) => listProductServices(...args) }));
vi.mock("@/lib/core/stock/stock.service", () => ({ listWarehousesForOrganization: (...args: unknown[]) => listWarehousesForOrganization(...args) }));

const { previewStockImport, buildPropositionsFromReviewedRows } = await import("../stock-import.service");

const PRODUCT = { id: "p1", name: "Çelik Profil", status: "ACTIVE" };
const WAREHOUSE = { id: "w1", name: "Ana Depo" };
const WAREHOUSE_2 = { id: "w2", name: "İkinci Depo" };

describe("previewStockImport", () => {
  it("skips rows missing productRef or quantity", async () => {
    listProductServices.mockResolvedValue([PRODUCT]);
    listWarehousesForOrganization.mockResolvedValue([WAREHOUSE]);
    const preview = await previewStockImport({
      organizationId: "org1",
      headers: ["Ürün Adı", "Miktar"],
      rows: [
        { "Ürün Adı": "", "Miktar": "10" },
        { "Ürün Adı": "Çelik Profil", "Miktar": "" },
        { "Ürün Adı": "Çelik Profil", "Miktar": "10" },
      ],
    });
    expect(preview.rows).toHaveLength(1);
    expect(preview.totalRows).toBe(3);
  });

  it("auto-resolves the single warehouse when no warehouse column is present", async () => {
    listProductServices.mockResolvedValue([PRODUCT]);
    listWarehousesForOrganization.mockResolvedValue([WAREHOUSE]);
    const preview = await previewStockImport({
      organizationId: "org1",
      headers: ["Ürün Adı", "Miktar"],
      rows: [{ "Ürün Adı": "Çelik Profil", "Miktar": "10" }],
    });
    expect(preview.rows[0]!.warehouseMatch).toEqual({ status: "RESOLVED", id: "w1", label: "Ana Depo" });
    expect(preview.rows[0]!.excluded).toBe(false);
  });

  it("requires a warehouse column when the org has more than one warehouse", async () => {
    listProductServices.mockResolvedValue([PRODUCT]);
    listWarehousesForOrganization.mockResolvedValue([WAREHOUSE, WAREHOUSE_2]);
    const preview = await previewStockImport({
      organizationId: "org1",
      headers: ["Ürün Adı", "Miktar"],
      rows: [{ "Ürün Adı": "Çelik Profil", "Miktar": "10" }],
    });
    expect(preview.rows[0]!.warehouseMatch).toEqual({ status: "MISSING_MULTIPLE_WAREHOUSES" });
    expect(preview.rows[0]!.excluded).toBe(true);
    expect(preview.unresolvedCount).toBe(1);
  });

  it("excludes a row whose product can't be resolved", async () => {
    listProductServices.mockResolvedValue([PRODUCT]);
    listWarehousesForOrganization.mockResolvedValue([WAREHOUSE]);
    const preview = await previewStockImport({
      organizationId: "org1",
      headers: ["Ürün Adı", "Miktar"],
      rows: [{ "Ürün Adı": "Bilinmeyen Ürün", "Miktar": "10" }],
    });
    expect(preview.rows[0]!.productMatch).toEqual({ status: "NOT_FOUND" });
    expect(preview.rows[0]!.excluded).toBe(true);
  });
});

describe("buildPropositionsFromReviewedRows (stock)", () => {
  it("builds one CREATE proposition per included row with productServiceId/warehouseId substituted in", () => {
    const propositions = buildPropositionsFromReviewedRows([
      {
        rowIndex: 0,
        values: { productRef: "Çelik Profil", quantity: "10", lot: "L1" },
        productMatch: { status: "RESOLVED", id: "p1", label: "Çelik Profil" },
        warehouseMatch: { status: "RESOLVED", id: "w1", label: "Ana Depo" },
        excluded: false,
      },
      {
        rowIndex: 1,
        values: { productRef: "Bilinmeyen Ürün", quantity: "5" },
        productMatch: { status: "NOT_FOUND" },
        warehouseMatch: { status: "RESOLVED", id: "w1", label: "Ana Depo" },
        excluded: true,
      },
    ]);
    expect(propositions).toHaveLength(1);
    expect(propositions[0]!.targetDomain).toBe("Stock");
    expect(propositions[0]!.operation).toBe("CREATE");
    expect(propositions[0]!.changes).toEqual([
      { fieldPath: "productServiceId", proposedValue: "p1" },
      { fieldPath: "warehouseId", proposedValue: "w1" },
      { fieldPath: "quantity", proposedValue: "10" },
      { fieldPath: "lot", proposedValue: "L1" },
    ]);
  });
});
