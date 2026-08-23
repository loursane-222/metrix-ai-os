import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listSuppliers: vi.fn(),
  requestSupplierMessage: vi.fn(),
}));

vi.mock("@/lib/suppliers/suppliers-client", () => ({ listSuppliers: mocks.listSuppliers }));
vi.mock("@/lib/executive-communication/supplier-message-client", () => ({ requestSupplierMessage: mocks.requestSupplierMessage }));

const { supplierMessageConversationExtension } = await import("../supplier-message-conversation-extension");

const supplier = { id: "s-1", displayName: "Vega Metal", legalName: null, phone: null, email: "vega@example.com", taxNumber: null, taxOffice: null };

beforeEach(() => { vi.clearAllMocks(); });

describe("supplier-message-conversation-extension", () => {
  it("does not handle utterances without the colon-delimited message form", async () => {
    const result = await supplierMessageConversationExtension.execute("Vega Metal'e teklif gönder");
    expect(result.status).toBe("NOT_HANDLED");
    expect(mocks.listSuppliers).not.toHaveBeenCalled();
  });

  it("asks for clarification when the named supplier can't be found", async () => {
    mocks.listSuppliers.mockResolvedValue({ ok: true, data: { suppliers: [] } });
    const result = await supplierMessageConversationExtension.execute("Bilinmeyen Firma'ya mesaj gönder: Merhaba");
    expect(result.handoff?.outcomeCode).toBe("SUPPLIER_MESSAGE_SUPPLIER_NOT_FOUND");
    expect(result.handoff?.resultStatus).toBe("CLARIFICATION_REQUIRED");
  });

  it("sends the user's own dictated message verbatim and reports EXECUTED on success", async () => {
    mocks.listSuppliers.mockResolvedValue({ ok: true, data: { suppliers: [supplier] } });
    mocks.requestSupplierMessage.mockResolvedValue({ outcome: "SENT", communicationId: "c1", recipientEmail: "vega@example.com" });

    const result = await supplierMessageConversationExtension.execute("Vega Metal'e mesaj gönder: Siparişin teslim tarihini onaylar mısınız?");

    expect(result.handoff?.outcomeCode).toBe("SUPPLIER_MESSAGE_SENT");
    expect(result.handoff?.resultStatus).toBe("EXECUTED");
    expect(result.handoff?.mutationPerformed).toBe(true);
    expect(mocks.requestSupplierMessage).toHaveBeenCalledWith({ supplierId: "s-1", messageBody: "Siparişin teslim tarihini onaylar mısınız?" });
  });

  it("strips surrounding quotes from the dictated message before sending", async () => {
    mocks.listSuppliers.mockResolvedValue({ ok: true, data: { suppliers: [supplier] } });
    mocks.requestSupplierMessage.mockResolvedValue({ outcome: "SENT", communicationId: "c1", recipientEmail: "vega@example.com" });

    await supplierMessageConversationExtension.execute('Vega Metal\'e mesaj gönder: "Teslimat ne zaman?"');

    expect(mocks.requestSupplierMessage).toHaveBeenCalledWith({ supplierId: "s-1", messageBody: "Teslimat ne zaman?" });
  });

  it("asks for clarification when the supplier has no email on file, never inventing one", async () => {
    mocks.listSuppliers.mockResolvedValue({ ok: true, data: { suppliers: [supplier] } });
    mocks.requestSupplierMessage.mockResolvedValue({ outcome: "MISSING_RECIPIENT_EMAIL" });

    const result = await supplierMessageConversationExtension.execute("Vega Metal'e mesaj gönder: Merhaba");

    expect(result.handoff?.outcomeCode).toBe("SUPPLIER_MESSAGE_EMAIL_MISSING");
    expect(result.handoff?.resultStatus).toBe("CLARIFICATION_REQUIRED");
  });
});
