import { describe, expect, it, vi } from "vitest";

const detectCustomerDuplicates = vi.fn();
vi.mock("@/lib/customers/customer-duplicate-detection", () => ({ detectCustomerDuplicates: (...args: unknown[]) => detectCustomerDuplicates(...args) }));

const { previewCustomerImport, buildPropositionsFromReviewedRows } = await import("../customer-import.service");

describe("previewCustomerImport", () => {
  it("skips rows with no displayName after mapping", async () => {
    detectCustomerDuplicates.mockResolvedValue([]);
    const preview = await previewCustomerImport({
      organizationId: "org1",
      headers: ["Ünvan", "Telefon"],
      rows: [{ "Ünvan": "", "Telefon": "5551112233" }, { "Ünvan": "Atlas İnşaat", "Telefon": "5551112233" }],
    });
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]!.values.displayName).toBe("Atlas İnşaat");
    expect(preview.totalRows).toBe(2);
  });

  it("excludes a row with a STRONG duplicate match and reports the count", async () => {
    detectCustomerDuplicates.mockResolvedValue([{ customerId: "c1", displayName: "Atlas İnşaat", strength: "STRONG", matchedFields: ["taxNumber"] }]);
    const preview = await previewCustomerImport({
      organizationId: "org1",
      headers: ["Ünvan", "Vergi No"],
      rows: [{ "Ünvan": "Atlas İnşaat", "Vergi No": "1234567890" }],
    });
    expect(preview.rows[0]!.excluded).toBe(true);
    expect(preview.duplicateCount).toBe(1);
  });

  it("does not exclude a row with only a WEAK duplicate match", async () => {
    detectCustomerDuplicates.mockResolvedValue([{ customerId: "c1", displayName: "Atlas İnşaat", strength: "WEAK", matchedFields: ["phone"] }]);
    const preview = await previewCustomerImport({
      organizationId: "org1",
      headers: ["Ünvan", "Telefon"],
      rows: [{ "Ünvan": "Atlas İnşaat", "Telefon": "5551112233" }],
    });
    expect(preview.rows[0]!.excluded).toBe(false);
    expect(preview.duplicateCount).toBe(0);
  });

  it("passes customer.-prefixed keys to detectCustomerDuplicates", async () => {
    detectCustomerDuplicates.mockResolvedValue([]);
    await previewCustomerImport({
      organizationId: "org1",
      headers: ["Ünvan", "Vergi No"],
      rows: [{ "Ünvan": "Atlas İnşaat", "Vergi No": "1234567890" }],
    });
    expect(detectCustomerDuplicates).toHaveBeenCalledWith("org1", { "customer.taxNumber": "1234567890" });
  });
});

describe("buildPropositionsFromReviewedRows", () => {
  it("builds one CREATE proposition per included row with bare field paths", () => {
    const propositions = buildPropositionsFromReviewedRows([
      { rowIndex: 0, values: { displayName: "Atlas İnşaat", taxNumber: "1234567890" }, duplicates: [], excluded: false },
      { rowIndex: 1, values: { displayName: "Skip Me" }, duplicates: [], excluded: true },
    ]);
    expect(propositions).toHaveLength(1);
    expect(propositions[0]!.targetDomain).toBe("Customer");
    expect(propositions[0]!.operation).toBe("CREATE");
    expect(propositions[0]!.entityResolutionStatus).toBe("NEW_ENTITY");
    expect(propositions[0]!.changes).toEqual([
      { fieldPath: "displayName", proposedValue: "Atlas İnşaat" },
      { fieldPath: "taxNumber", proposedValue: "1234567890" },
    ]);
  });
});
