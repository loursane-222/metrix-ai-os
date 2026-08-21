import { describe, expect, it, vi } from "vitest";

const findSupplierByIdentity = vi.fn();
vi.mock("@/lib/core/suppliers/supplier.repository", () => ({ findSupplierByIdentity: (...args: unknown[]) => findSupplierByIdentity(...args) }));

const { previewSupplierImport, buildPropositionsFromReviewedRows } = await import("../supplier-import.service");

describe("previewSupplierImport", () => {
  it("skips rows with no displayName after mapping", async () => {
    findSupplierByIdentity.mockResolvedValue(null);
    const preview = await previewSupplierImport({
      organizationId: "org1",
      headers: ["Ünvan", "Telefon"],
      rows: [{ "Ünvan": "", "Telefon": "5551112233" }, { "Ünvan": "Demir Metal", "Telefon": "5551112233" }],
    });
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]!.values.displayName).toBe("Demir Metal");
    expect(preview.totalRows).toBe(2);
  });

  it("defaults a row matching an existing supplier's identity to skip, and exposes a merge target", async () => {
    findSupplierByIdentity.mockResolvedValue({ id: "s1", displayName: "Demir Metal" });
    const preview = await previewSupplierImport({
      organizationId: "org1",
      headers: ["Ünvan"],
      rows: [{ "Ünvan": "Demir Metal" }],
    });
    expect(preview.rows[0]!.action).toBe("skip");
    expect(preview.rows[0]!.mergeTargetId).toBe("s1");
    expect(preview.duplicateCount).toBe(1);
  });

  it("defaults a row with no identity match to create", async () => {
    findSupplierByIdentity.mockResolvedValue(null);
    const preview = await previewSupplierImport({
      organizationId: "org1",
      headers: ["Ünvan"],
      rows: [{ "Ünvan": "Yeni Tedarikçi" }],
    });
    expect(preview.rows[0]!.action).toBe("create");
    expect(preview.rows[0]!.mergeTargetId).toBeNull();
    expect(preview.duplicateCount).toBe(0);
  });
});

describe("buildPropositionsFromReviewedRows (suppliers)", () => {
  it("builds one CREATE proposition per create-action row", () => {
    const propositions = buildPropositionsFromReviewedRows([
      { rowIndex: 0, values: { displayName: "Demir Metal", phone: "5551112233" }, mergeTargetId: null, mergeTargetName: null, action: "create" },
      { rowIndex: 1, values: { displayName: "Skip Me" }, mergeTargetId: null, mergeTargetName: null, action: "skip" },
    ]);
    expect(propositions).toHaveLength(1);
    expect(propositions[0]!.targetDomain).toBe("Supplier");
    expect(propositions[0]!.operation).toBe("CREATE");
    expect(propositions[0]!.entityResolutionStatus).toBe("NEW_ENTITY");
    expect(propositions[0]!.changes).toEqual([
      { fieldPath: "displayName", proposedValue: "Demir Metal" },
      { fieldPath: "phone", proposedValue: "5551112233" },
    ]);
  });

  it("builds an UPDATE proposition targeting mergeTargetId for an update-action row", () => {
    const propositions = buildPropositionsFromReviewedRows([
      { rowIndex: 0, values: { displayName: "Demir Metal", phone: "5551112233" }, mergeTargetId: "s1", mergeTargetName: "Demir Metal", action: "update" },
    ]);
    expect(propositions).toHaveLength(1);
    expect(propositions[0]!.targetDomain).toBe("Supplier");
    expect(propositions[0]!.operation).toBe("UPDATE");
    expect(propositions[0]!.targetRecordId).toBe("s1");
    expect(propositions[0]!.entityResolutionStatus).toBe("RESOLVED");
  });
});
