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

  it("defaults a row with a STRONG duplicate match to skip, and exposes a merge target", async () => {
    detectCustomerDuplicates.mockResolvedValue([{ customerId: "c1", displayName: "Atlas İnşaat", strength: "STRONG", matchedFields: ["taxNumber"] }]);
    const preview = await previewCustomerImport({
      organizationId: "org1",
      headers: ["Ünvan", "Vergi No"],
      rows: [{ "Ünvan": "Atlas İnşaat", "Vergi No": "1234567890" }],
    });
    expect(preview.rows[0]!.action).toBe("skip");
    expect(preview.rows[0]!.mergeTargetId).toBe("c1");
    expect(preview.duplicateCount).toBe(1);
  });

  it("defaults a row with only a WEAK duplicate match to create, but still exposes a merge target", async () => {
    detectCustomerDuplicates.mockResolvedValue([{ customerId: "c1", displayName: "Atlas İnşaat", strength: "WEAK", matchedFields: ["phone"] }]);
    const preview = await previewCustomerImport({
      organizationId: "org1",
      headers: ["Ünvan", "Telefon"],
      rows: [{ "Ünvan": "Atlas İnşaat", "Telefon": "5551112233" }],
    });
    expect(preview.rows[0]!.action).toBe("create");
    expect(preview.rows[0]!.mergeTargetId).toBe("c1");
    expect(preview.duplicateCount).toBe(0);
  });

  it("does not expose a merge target when duplicates are ambiguous (more than one match)", async () => {
    detectCustomerDuplicates.mockResolvedValue([
      { customerId: "c1", displayName: "Atlas İnşaat", strength: "WEAK", matchedFields: ["phone"] },
      { customerId: "c2", displayName: "Atlas İnşaat A.Ş.", strength: "WEAK", matchedFields: ["phone"] },
    ]);
    const preview = await previewCustomerImport({
      organizationId: "org1",
      headers: ["Ünvan", "Telefon"],
      rows: [{ "Ünvan": "Atlas İnşaat", "Telefon": "5551112233" }],
    });
    expect(preview.rows[0]!.mergeTargetId).toBeNull();
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
  it("builds one CREATE proposition per create-action row with bare field paths", () => {
    const propositions = buildPropositionsFromReviewedRows([
      { rowIndex: 0, values: { displayName: "Atlas İnşaat", taxNumber: "1234567890" }, duplicates: [], mergeTargetId: null, action: "create" },
      { rowIndex: 1, values: { displayName: "Skip Me" }, duplicates: [], mergeTargetId: null, action: "skip" },
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

  it("builds an UPDATE proposition targeting mergeTargetId for an update-action row, wrapping billingAddress as an object", () => {
    const propositions = buildPropositionsFromReviewedRows([
      { rowIndex: 0, values: { displayName: "Atlas İnşaat", phone: "5551112233", billingAddress: "İstanbul" }, duplicates: [], mergeTargetId: "c1", action: "update" },
    ]);
    expect(propositions).toHaveLength(1);
    expect(propositions[0]!.targetDomain).toBe("Customer");
    expect(propositions[0]!.operation).toBe("UPDATE");
    expect(propositions[0]!.targetRecordId).toBe("c1");
    expect(propositions[0]!.entityResolutionStatus).toBe("RESOLVED");
    expect(propositions[0]!.changes).toEqual([
      { fieldPath: "displayName", proposedValue: "Atlas İnşaat" },
      { fieldPath: "phone", proposedValue: "5551112233" },
      { fieldPath: "billingAddress", proposedValue: { line1: "İstanbul" } },
    ]);
  });

  it("falls back to a CREATE proposition when action is update but no mergeTargetId is set", () => {
    const propositions = buildPropositionsFromReviewedRows([
      { rowIndex: 0, values: { displayName: "Atlas İnşaat" }, duplicates: [], mergeTargetId: null, action: "update" },
    ]);
    expect(propositions[0]!.operation).toBe("CREATE");
  });
});
