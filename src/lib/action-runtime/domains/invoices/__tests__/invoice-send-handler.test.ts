import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { sendInvoiceMock } = vi.hoisted(() => ({ sendInvoiceMock: vi.fn() }));
vi.mock("@/lib/core/invoices/invoice.service", () => ({ sendInvoice: sendInvoiceMock }));

import { invoiceSendHandler } from "../invoice-send-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "invoice.send",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["invoices.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("invoiceSendHandler", () => {
  beforeEach(() => sendInvoiceMock.mockReset());

  it("moves the addressed invoice through the canonical service", async () => {
    sendInvoiceMock.mockResolvedValue({ id: "inv-1", status: "SENT" });

    const result = await invoiceSendHandler(envelope({ invoiceId: "inv-1" }));

    expect(sendInvoiceMock).toHaveBeenCalledWith({ invoiceId: "inv-1", organizationId: "org-1" });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "invoice", entityId: "inv-1" }, metadata: { changedFields: ["status"] } });
  });

  it("rejects a missing invoice id before mutation", async () => {
    await expect(invoiceSendHandler(envelope({}))).rejects.toThrow("invoiceId is required");
    expect(sendInvoiceMock).not.toHaveBeenCalled();
  });
});
