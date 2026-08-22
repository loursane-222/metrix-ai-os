import { describe, expect, it, vi, beforeEach } from "vitest";

const detectCustomerDuplicates = vi.fn();
vi.mock("@/lib/customers/customer-duplicate-detection", () => ({ detectCustomerDuplicates: (...args: unknown[]) => detectCustomerDuplicates(...args) }));

const getCustomerByIdForOrganization = vi.fn();
vi.mock("@/lib/core/customers/customer.service", () => ({ getCustomerByIdForOrganization: (...args: unknown[]) => getCustomerByIdForOrganization(...args) }));

const { previewCustomerImport, buildPropositionsFromReviewedRows } = await import("../customer-import.service");

beforeEach(() => {
  getCustomerByIdForOrganization.mockReset();
});

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

  it("passes customer.-prefixed keys to detectCustomerDuplicates, always including displayName", async () => {
    detectCustomerDuplicates.mockResolvedValue([]);
    await previewCustomerImport({
      organizationId: "org1",
      headers: ["Ünvan", "Vergi No"],
      rows: [{ "Ünvan": "Atlas İnşaat", "Vergi No": "1234567890" }],
    });
    expect(detectCustomerDuplicates).toHaveBeenCalledWith("org1", { "customer.displayName": "Atlas İnşaat", "customer.taxNumber": "1234567890" });
  });

  // Live repro: a 381-row import that partially succeeded (timed out
  // mid-way) was re-uploaded, and every row — including ones already
  // created by the first run — came back as "381 tanesi içe aktarılacak"
  // with zero duplicates flagged. Root cause: most rows in the real file
  // carry only a company name (no tax number, cariKodu, email, or phone),
  // so the query built for detectCustomerDuplicates was empty and it was
  // never even called for them. displayName must always be part of the
  // query so a name-only row can still be recognized on re-import.
  it("still queries for duplicates by displayName alone when no other identifying field is present", async () => {
    detectCustomerDuplicates.mockResolvedValue([]);
    await previewCustomerImport({
      organizationId: "org1",
      headers: ["Ünvan"],
      rows: [{ "Ünvan": "2M Mermer (Mehmet Kocagöz Nakliye)" }],
    });
    expect(detectCustomerDuplicates).toHaveBeenCalledWith("org1", { "customer.displayName": "2M Mermer (Mehmet Kocagöz Nakliye)" });
  });
});

describe("buildPropositionsFromReviewedRows", () => {
  it("builds one CREATE proposition per create-action row with bare field paths", async () => {
    const propositions = await buildPropositionsFromReviewedRows([
      { rowIndex: 0, values: { displayName: "Atlas İnşaat", taxNumber: "1234567890" }, duplicates: [], mergeTargetId: null, action: "create" },
      { rowIndex: 1, values: { displayName: "Skip Me" }, duplicates: [], mergeTargetId: null, action: "skip" },
    ], "org1");
    expect(propositions).toHaveLength(1);
    expect(propositions[0]!.targetDomain).toBe("Customer");
    expect(propositions[0]!.operation).toBe("CREATE");
    expect(propositions[0]!.entityResolutionStatus).toBe("NEW_ENTITY");
    expect(propositions[0]!.changes).toEqual([
      { fieldPath: "displayName", proposedValue: "Atlas İnşaat" },
      { fieldPath: "taxNumber", proposedValue: "1234567890" },
    ]);
  });

  it("builds an UPDATE proposition targeting mergeTargetId for an update-action row, wrapping billingAddress as an object when the target has no existing address", async () => {
    getCustomerByIdForOrganization.mockResolvedValue({ id: "c1", billingAddress: null });
    const propositions = await buildPropositionsFromReviewedRows([
      { rowIndex: 0, values: { displayName: "Atlas İnşaat", phone: "5551112233", billingAddress: "İstanbul" }, duplicates: [], mergeTargetId: "c1", action: "update" },
    ], "org1");
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
    expect(getCustomerByIdForOrganization).toHaveBeenCalledWith("c1", "org1");
  });

  // Real gap found while answering the user's own question about
  // re-uploading a corrected file: customer.update writes billingAddress
  // as one JSON column, not merged field by field. An update proposition
  // that only sent { line1 } would silently erase an existing line2/city/
  // postalCode/country the customer already had on file, for a row whose
  // spreadsheet only ever carried a single address line.
  it("preserves the target customer's existing address sub-fields when updating billingAddress", async () => {
    getCustomerByIdForOrganization.mockResolvedValue({ id: "c1", billingAddress: { line1: "Eski Adres", city: "İzmir", postalCode: "35000", country: "TR" } });
    const propositions = await buildPropositionsFromReviewedRows([
      { rowIndex: 0, values: { displayName: "Atlas İnşaat", billingAddress: "Yeni Cadde No:5" }, duplicates: [], mergeTargetId: "c1", action: "update" },
    ], "org1");
    const billingAddressChange = propositions[0]!.changes.find((change) => change.fieldPath === "billingAddress");
    expect(billingAddressChange?.proposedValue).toEqual({ line1: "Yeni Cadde No:5", city: "İzmir", postalCode: "35000", country: "TR" });
  });

  it("falls back to a CREATE proposition when action is update but no mergeTargetId is set", async () => {
    const propositions = await buildPropositionsFromReviewedRows([
      { rowIndex: 0, values: { displayName: "Atlas İnşaat" }, duplicates: [], mergeTargetId: null, action: "update" },
    ], "org1");
    expect(propositions[0]!.operation).toBe("CREATE");
  });
});
