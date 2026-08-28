import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const mocks = vi.hoisted(() => ({
  findInvoiceById: vi.fn(),
  getCustomerByIdForOrganization: vi.fn(),
  pushInvoiceToBizimHesap: vi.fn(),
}));

vi.mock("@/lib/core/invoices/invoice.service", () => ({ findInvoiceById: mocks.findInvoiceById }));
vi.mock("@/lib/core/customers/customer.service", () => ({ getCustomerByIdForOrganization: mocks.getCustomerByIdForOrganization }));
vi.mock("@/lib/integrations/bizimhesap/bizimhesap.service", () => ({ pushInvoiceToBizimHesap: mocks.pushInvoiceToBizimHesap }));

const { handlePushInvoiceToBizimHesap } = await import("../push-invoice-to-bizimhesap-handler");

function envelope(input: Record<string, unknown>) {
  return {
    executionId: "exec-1", actionName: "integration.bizimhesap.push_invoice", input,
    entityRef: undefined, executionContext: { organizationId: "org-1" }, idempotencyKey: "idem-1", startedAt: new Date(),
  } as never;
}

const invoiceRow = { id: "inv-1", customerId: "cust-1", invoiceNumber: "INV-1", title: "Fatura", amount: 1000, taxRate: 20, taxAmount: 200, totalAmount: 1200, currency: "TRY", dueDate: null };
const customerRow = { id: "cust-1", displayName: "Atlas", legalName: "Atlas İnşaat", taxOffice: "Kadıköy", taxNumber: "123", email: null, phone: null, billingAddress: { addressLine1: "Merkez Mah.", city: "İstanbul" } };

describe("handlePushInvoiceToBizimHesap", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws when the invoice doesn't exist for this org", async () => {
    mocks.findInvoiceById.mockResolvedValue(null);
    await expect(handlePushInvoiceToBizimHesap(envelope({ invoiceId: "inv-1" }))).rejects.toThrow("Invoice not found.");
  });

  it("throws when the invoice has no linked customer", async () => {
    mocks.findInvoiceById.mockResolvedValue({ ...invoiceRow, customerId: null });
    await expect(handlePushInvoiceToBizimHesap(envelope({ invoiceId: "inv-1" }))).rejects.toThrow("no linked customer");
  });

  it("pushes the resolved invoice+customer and returns SUCCESS with the real BizimHesap guid", async () => {
    mocks.findInvoiceById.mockResolvedValue(invoiceRow);
    mocks.getCustomerByIdForOrganization.mockResolvedValue(customerRow);
    mocks.pushInvoiceToBizimHesap.mockResolvedValue({ guid: "g-1", url: "https://bizimhesap.com/x" });

    const result = await handlePushInvoiceToBizimHesap(envelope({ invoiceId: "inv-1" }));

    expect(result.status).toBe("SUCCESS");
    expect(result.entityRef).toEqual({ entityType: "invoice", entityId: "inv-1" });
    expect(result.metadata).toMatchObject({ bizimHesapGuid: "g-1" });
    const [callArg] = mocks.pushInvoiceToBizimHesap.mock.calls[0];
    expect(callArg.customer.addressLine).toBe("Merkez Mah., İstanbul");
    expect(callArg.invoice.amount).toBe(1000);
  });

  it("passes a null address line when billingAddress has none of the known keys, never fabricating one", async () => {
    mocks.findInvoiceById.mockResolvedValue(invoiceRow);
    mocks.getCustomerByIdForOrganization.mockResolvedValue({ ...customerRow, billingAddress: { note: "irrelevant" } });
    mocks.pushInvoiceToBizimHesap.mockResolvedValue({ guid: "g-1", url: "https://bizimhesap.com/x" });

    await handlePushInvoiceToBizimHesap(envelope({ invoiceId: "inv-1" }));

    const [callArg] = mocks.pushInvoiceToBizimHesap.mock.calls[0];
    expect(callArg.customer.addressLine).toBeNull();
  });
});
