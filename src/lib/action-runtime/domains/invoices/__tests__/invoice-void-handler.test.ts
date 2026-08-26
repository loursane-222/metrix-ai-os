import { beforeEach, describe, expect, it, vi } from "vitest";

const { voidInvoiceMock, findInvoiceByIdMock } = vi.hoisted(() => ({
  voidInvoiceMock: vi.fn(),
  findInvoiceByIdMock: vi.fn(),
}));
vi.mock("@/lib/core/invoices/invoice.service", () => ({
  voidInvoice: voidInvoiceMock,
  findInvoiceById: findInvoiceByIdMock,
}));

import { invoiceVoidHandler } from "../invoice-void-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "invoice.void",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["invoices.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("invoiceVoidHandler", () => {
  beforeEach(() => {
    voidInvoiceMock.mockReset();
    findInvoiceByIdMock.mockReset();
  });

  it("voids the addressed draft invoice through the canonical service", async () => {
    findInvoiceByIdMock.mockResolvedValue({ id: "i1", status: "DRAFT" });
    voidInvoiceMock.mockResolvedValue({ id: "i1", status: "CANCELLED" });

    const result = await invoiceVoidHandler(envelope({ invoiceId: "i1" }));

    expect(voidInvoiceMock).toHaveBeenCalledWith({ invoiceId: "i1", organizationId: "org-1" });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "invoice", entityId: "i1" } });
  });

  it("reports NO_CHANGE without a second mutation when already cancelled", async () => {
    findInvoiceByIdMock.mockResolvedValue({ id: "i1", status: "CANCELLED" });

    const result = await invoiceVoidHandler(envelope({ invoiceId: "i1" }));

    expect(voidInvoiceMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "SUCCESS", resultOutcome: "NO_CHANGE" });
  });

  it("surfaces a real failure (not a silent no-op) for an already-sent invoice", async () => {
    findInvoiceByIdMock.mockResolvedValue({ id: "i1", status: "SENT" });
    voidInvoiceMock.mockRejectedValue(new Error("Only draft invoices can be voided."));

    await expect(invoiceVoidHandler(envelope({ invoiceId: "i1" }))).rejects.toThrow(/draft/);
  });

  it("rejects a missing invoiceId before mutation", async () => {
    await expect(invoiceVoidHandler(envelope({}))).rejects.toThrow(/invoiceId/);
    expect(voidInvoiceMock).not.toHaveBeenCalled();
  });
});
