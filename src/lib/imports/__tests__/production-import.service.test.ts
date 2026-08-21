import { describe, expect, it, vi } from "vitest";

const listProductServices = vi.fn();
vi.mock("@/lib/core/products/product.service", () => ({ listProductServices: (...args: unknown[]) => listProductServices(...args) }));

const { previewProductionImport, buildPropositionsFromReviewedRows } = await import("../production-import.service");

const PRODUCT = { id: "p1", name: "Çelik Profil", status: "ACTIVE" };

describe("previewProductionImport", () => {
  it("skips rows missing orderNumber or quantityPlanned", async () => {
    listProductServices.mockResolvedValue([PRODUCT]);
    const preview = await previewProductionImport({
      organizationId: "org1",
      headers: ["Emir No", "Planlanan Miktar"],
      rows: [
        { "Emir No": "", "Planlanan Miktar": "10" },
        { "Emir No": "UR-001", "Planlanan Miktar": "" },
        { "Emir No": "UR-001", "Planlanan Miktar": "10" },
      ],
    });
    expect(preview.rows).toHaveLength(1);
    expect(preview.totalRows).toBe(3);
  });

  it("allows a row with no product reference at all (optional)", async () => {
    listProductServices.mockResolvedValue([PRODUCT]);
    const preview = await previewProductionImport({
      organizationId: "org1",
      headers: ["Emir No", "Planlanan Miktar"],
      rows: [{ "Emir No": "UR-001", "Planlanan Miktar": "10" }],
    });
    expect(preview.rows[0]!.productMatch).toBeNull();
    expect(preview.rows[0]!.excluded).toBe(false);
  });

  it("excludes a row whose given product reference can't be resolved", async () => {
    listProductServices.mockResolvedValue([PRODUCT]);
    const preview = await previewProductionImport({
      organizationId: "org1",
      headers: ["Emir No", "Ürün Adı", "Planlanan Miktar"],
      rows: [{ "Emir No": "UR-001", "Ürün Adı": "Bilinmeyen Ürün", "Planlanan Miktar": "10" }],
    });
    expect(preview.rows[0]!.productMatch).toEqual({ status: "NOT_FOUND" });
    expect(preview.rows[0]!.excluded).toBe(true);
    expect(preview.unresolvedProductCount).toBe(1);
  });
});

describe("buildPropositionsFromReviewedRows (production)", () => {
  it("builds one CREATE proposition per included row, adding productServiceId only when resolved", () => {
    const propositions = buildPropositionsFromReviewedRows([
      {
        rowIndex: 0,
        values: { orderNumber: "UR-001", quantityPlanned: "10" },
        productMatch: null,
        excluded: false,
      },
      {
        rowIndex: 1,
        values: { orderNumber: "UR-002", quantityPlanned: "5" },
        productMatch: { status: "NOT_FOUND" },
        excluded: true,
      },
    ]);
    expect(propositions).toHaveLength(1);
    expect(propositions[0]!.targetDomain).toBe("ProductionOrder");
    expect(propositions[0]!.operation).toBe("CREATE");
    expect(propositions[0]!.changes).toEqual([
      { fieldPath: "orderNumber", proposedValue: "UR-001" },
      { fieldPath: "quantityPlanned", proposedValue: "10" },
    ]);
  });
});
