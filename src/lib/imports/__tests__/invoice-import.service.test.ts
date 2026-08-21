import { describe, expect, it, vi } from "vitest";

const listCustomers = vi.fn();
vi.mock("@/lib/core/customers/customer.service", () => ({ listCustomers: (...args: unknown[]) => listCustomers(...args) }));

const { previewInvoiceImport, buildPropositionsFromReviewedRows } = await import("../invoice-import.service");

const CUSTOMER = { id: "c1", displayName: "Atlas İnşaat", legalName: null, phone: null, email: null, cariKodu: null, taxNumber: "1234567890" };

describe("previewInvoiceImport", () => {
  it("skips rows missing customerRef, title, or amount", async () => {
    listCustomers.mockResolvedValue([CUSTOMER]);
    const preview = await previewInvoiceImport({
      organizationId: "org1",
      headers: ["Müşteri", "Açıklama", "Tutar"],
      rows: [
        { "Müşteri": "", "Açıklama": "Danışmanlık", "Tutar": "1000" },
        { "Müşteri": "Atlas İnşaat", "Açıklama": "", "Tutar": "1000" },
        { "Müşteri": "Atlas İnşaat", "Açıklama": "Danışmanlık", "Tutar": "1000" },
      ],
    });
    expect(preview.rows).toHaveLength(1);
    expect(preview.totalRows).toBe(3);
  });

  it("resolves a row's customer and excludes it only when unresolved", async () => {
    listCustomers.mockResolvedValue([CUSTOMER]);
    const preview = await previewInvoiceImport({
      organizationId: "org1",
      headers: ["Müşteri", "Açıklama", "Tutar"],
      rows: [
        { "Müşteri": "Atlas İnşaat", "Açıklama": "Danışmanlık", "Tutar": "1000" },
        { "Müşteri": "Bilinmeyen Firma", "Açıklama": "Danışmanlık", "Tutar": "1000" },
      ],
    });
    expect(preview.rows[0]!.customerMatch).toEqual({ status: "RESOLVED", customerId: "c1", customerName: "Atlas İnşaat" });
    expect(preview.rows[0]!.excluded).toBe(false);
    expect(preview.rows[1]!.customerMatch).toEqual({ status: "NOT_FOUND" });
    expect(preview.rows[1]!.excluded).toBe(true);
    expect(preview.unresolvedCustomerCount).toBe(1);
  });
});

describe("buildPropositionsFromReviewedRows (invoices)", () => {
  it("builds one CREATE proposition per resolved, included row with customerId substituted in", () => {
    const propositions = buildPropositionsFromReviewedRows([
      {
        rowIndex: 0,
        values: { customerRef: "Atlas İnşaat", title: "Danışmanlık", amount: "1000", invoiceNumber: "2024-00453" },
        customerMatch: { status: "RESOLVED", customerId: "c1", customerName: "Atlas İnşaat" },
        excluded: false,
      },
      {
        rowIndex: 1,
        values: { customerRef: "Bilinmeyen Firma", title: "Danışmanlık", amount: "1000" },
        customerMatch: { status: "NOT_FOUND" },
        excluded: true,
      },
    ]);
    expect(propositions).toHaveLength(1);
    expect(propositions[0]!.targetDomain).toBe("Invoice");
    expect(propositions[0]!.operation).toBe("CREATE");
    expect(propositions[0]!.changes).toEqual([
      { fieldPath: "customerId", proposedValue: "c1" },
      { fieldPath: "invoiceNumber", proposedValue: "2024-00453" },
      { fieldPath: "title", proposedValue: "Danışmanlık" },
      { fieldPath: "amount", proposedValue: "1000" },
    ]);
  });
});
