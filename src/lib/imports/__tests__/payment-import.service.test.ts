import { describe, expect, it, vi } from "vitest";

const listCustomers = vi.fn();
vi.mock("@/lib/core/customers/customer.service", () => ({ listCustomers: (...args: unknown[]) => listCustomers(...args) }));

const { previewPaymentImport, buildPropositionsFromReviewedRows } = await import("../payment-import.service");

const CUSTOMER = { id: "c1", displayName: "Atlas İnşaat", legalName: null, phone: null, email: null, cariKodu: null, taxNumber: "1234567890" };

describe("previewPaymentImport", () => {
  it("skips rows missing customerRef, title, or amount", async () => {
    listCustomers.mockResolvedValue([CUSTOMER]);
    const preview = await previewPaymentImport({
      organizationId: "org1",
      headers: ["Müşteri", "Açıklama", "Tutar"],
      rows: [
        { "Müşteri": "", "Açıklama": "Ocak tahsilatı", "Tutar": "1000" },
        { "Müşteri": "Atlas İnşaat", "Açıklama": "", "Tutar": "1000" },
        { "Müşteri": "Atlas İnşaat", "Açıklama": "Ocak tahsilatı", "Tutar": "1000" },
      ],
    });
    expect(preview.rows).toHaveLength(1);
    expect(preview.totalRows).toBe(3);
  });

  it("resolves a row's customer and excludes it only when unresolved", async () => {
    listCustomers.mockResolvedValue([CUSTOMER]);
    const preview = await previewPaymentImport({
      organizationId: "org1",
      headers: ["Müşteri", "Açıklama", "Tutar"],
      rows: [
        { "Müşteri": "Atlas İnşaat", "Açıklama": "Ocak tahsilatı", "Tutar": "1000" },
        { "Müşteri": "Bilinmeyen Firma", "Açıklama": "Ocak tahsilatı", "Tutar": "1000" },
      ],
    });
    expect(preview.rows[0]!.customerMatch).toEqual({ status: "RESOLVED", customerId: "c1", customerName: "Atlas İnşaat" });
    expect(preview.rows[0]!.excluded).toBe(false);
    expect(preview.rows[1]!.customerMatch).toEqual({ status: "NOT_FOUND" });
    expect(preview.rows[1]!.excluded).toBe(true);
    expect(preview.unresolvedCustomerCount).toBe(1);
  });

  it("does not flag two identical rows for the same customer as duplicates of each other", async () => {
    listCustomers.mockResolvedValue([CUSTOMER]);
    const preview = await previewPaymentImport({
      organizationId: "org1",
      headers: ["Müşteri", "Açıklama", "Tutar"],
      rows: [
        { "Müşteri": "Atlas İnşaat", "Açıklama": "Kısım 1", "Tutar": "500" },
        { "Müşteri": "Atlas İnşaat", "Açıklama": "Kısım 1", "Tutar": "500" },
      ],
    });
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[0]!.excluded).toBe(false);
    expect(preview.rows[1]!.excluded).toBe(false);
  });
});

describe("buildPropositionsFromReviewedRows (payments)", () => {
  it("builds one CREATE proposition per included row with customerId substituted in", () => {
    const propositions = buildPropositionsFromReviewedRows([
      {
        rowIndex: 0,
        values: { customerRef: "Atlas İnşaat", title: "Ocak tahsilatı", amount: "1000" },
        customerMatch: { status: "RESOLVED", customerId: "c1", customerName: "Atlas İnşaat" },
        excluded: false,
      },
      {
        rowIndex: 1,
        values: { customerRef: "Bilinmeyen Firma", title: "Ocak tahsilatı", amount: "1000" },
        customerMatch: { status: "NOT_FOUND" },
        excluded: true,
      },
    ]);
    expect(propositions).toHaveLength(1);
    expect(propositions[0]!.targetDomain).toBe("Payment");
    expect(propositions[0]!.operation).toBe("CREATE");
    expect(propositions[0]!.changes).toEqual([
      { fieldPath: "customerId", proposedValue: "c1" },
      { fieldPath: "title", proposedValue: "Ocak tahsilatı" },
      { fieldPath: "amount", proposedValue: "1000" },
    ]);
  });
});
