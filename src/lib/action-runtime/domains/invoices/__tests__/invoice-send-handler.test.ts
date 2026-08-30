import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { sendInvoiceMock, materializeReceivableScheduleMock } = vi.hoisted(() => ({
  sendInvoiceMock: vi.fn(),
  materializeReceivableScheduleMock: vi.fn(),
}));
vi.mock("@/lib/core/invoices/invoice.service", () => ({ sendInvoice: sendInvoiceMock }));
vi.mock("@/lib/core/obligations/obligation-schedule.service", () => ({ materializeReceivableSchedule: materializeReceivableScheduleMock }));

import { invoiceSendHandler } from "../invoice-send-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "invoice.send",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["invoices.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

const SENT_AT = new Date("2026-08-30T12:00:00.000Z");

describe("invoiceSendHandler", () => {
  beforeEach(() => { sendInvoiceMock.mockReset(); materializeReceivableScheduleMock.mockReset(); });

  it("moves the addressed invoice through the canonical service and materializes its receivable schedule using the send transition's own timestamp", async () => {
    sendInvoiceMock.mockResolvedValue({ id: "inv-1", status: "SENT", updatedAt: SENT_AT });
    materializeReceivableScheduleMock.mockResolvedValue({ lines: [{ id: "line-1" }], payments: [{ id: "payment-1" }], replayed: false });

    const result = await invoiceSendHandler(envelope({ invoiceId: "inv-1" }));

    expect(sendInvoiceMock).toHaveBeenCalledWith({ invoiceId: "inv-1", organizationId: "org-1" });
    expect(materializeReceivableScheduleMock).toHaveBeenCalledWith({ organizationId: "org-1", invoiceId: "inv-1", actorId: "user-1", referenceDate: SENT_AT });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "invoice", entityId: "inv-1" }, metadata: { changedFields: ["status"], obligationMaterialized: true, obligationLineCount: 1 } });
  });

  it("still reports invoice.send SUCCESS when materialization fails — a non-critical side effect, not a blocker (e.g. invoice has no customer)", async () => {
    sendInvoiceMock.mockResolvedValue({ id: "inv-1", status: "SENT", updatedAt: SENT_AT });
    materializeReceivableScheduleMock.mockRejectedValue(Object.assign(new Error("invoice has no customer"), { status: 409 }));

    const result = await invoiceSendHandler(envelope({ invoiceId: "inv-1" }));

    expect(result).toMatchObject({ status: "SUCCESS", metadata: { obligationMaterialized: false } });
  });

  it("rejects a missing invoice id before mutation", async () => {
    await expect(invoiceSendHandler(envelope({}))).rejects.toThrow("invoiceId is required");
    expect(sendInvoiceMock).not.toHaveBeenCalled();
    expect(materializeReceivableScheduleMock).not.toHaveBeenCalled();
  });
});
