import { describe, expect, it, vi } from "vitest";

const listCustomers = vi.fn();
vi.mock("@/lib/core/customers/customer.service", () => ({ listCustomers: (...args: unknown[]) => listCustomers(...args) }));

const { previewOfferImport, buildPropositionsFromReviewedRows } = await import("../offer-import.service");

const CUSTOMER = { id: "c1", displayName: "Atlas İnşaat", legalName: null, phone: null, email: null, cariKodu: null, taxNumber: "1234567890" };

describe("previewOfferImport", () => {
  it("skips rows missing customerRef or title", async () => {
    listCustomers.mockResolvedValue([CUSTOMER]);
    const preview = await previewOfferImport({
      organizationId: "org1",
      headers: ["Müşteri", "Açıklama"],
      rows: [
        { "Müşteri": "", "Açıklama": "Granit teklifi" },
        { "Müşteri": "Atlas İnşaat", "Açıklama": "" },
        { "Müşteri": "Atlas İnşaat", "Açıklama": "Granit teklifi" },
      ],
    });
    expect(preview.rows).toHaveLength(1);
    expect(preview.totalRows).toBe(3);
  });

  it("resolves a row's customer and excludes it only when unresolved", async () => {
    listCustomers.mockResolvedValue([CUSTOMER]);
    const preview = await previewOfferImport({
      organizationId: "org1",
      headers: ["Müşteri", "Açıklama"],
      rows: [
        { "Müşteri": "Atlas İnşaat", "Açıklama": "Granit teklifi" },
        { "Müşteri": "Bilinmeyen Firma", "Açıklama": "Granit teklifi" },
      ],
    });
    expect(preview.rows[0]!.customerMatch).toEqual({ status: "RESOLVED", customerId: "c1", customerName: "Atlas İnşaat" });
    expect(preview.rows[0]!.excluded).toBe(false);
    expect(preview.rows[1]!.customerMatch).toEqual({ status: "NOT_FOUND" });
    expect(preview.rows[1]!.excluded).toBe(true);
    expect(preview.unresolvedCustomerCount).toBe(1);
  });
});

describe("buildPropositionsFromReviewedRows (offers)", () => {
  it("builds one CREATE proposition per included row with customerId substituted in", () => {
    const propositions = buildPropositionsFromReviewedRows([
      {
        rowIndex: 0,
        values: { customerRef: "Atlas İnşaat", title: "Granit teklifi", amount: "5000" },
        customerMatch: { status: "RESOLVED", customerId: "c1", customerName: "Atlas İnşaat" },
        excluded: false,
      },
      {
        rowIndex: 1,
        values: { customerRef: "Bilinmeyen Firma", title: "Granit teklifi" },
        customerMatch: { status: "NOT_FOUND" },
        excluded: true,
      },
    ]);
    expect(propositions).toHaveLength(1);
    expect(propositions[0]!.targetDomain).toBe("Quote");
    expect(propositions[0]!.operation).toBe("CREATE");
    expect(propositions[0]!.changes).toEqual([
      { fieldPath: "customerId", proposedValue: "c1" },
      { fieldPath: "title", proposedValue: "Granit teklifi" },
      { fieldPath: "amount", proposedValue: "5000" },
    ]);
  });
});
