import { beforeEach, describe, expect, it, vi } from "vitest";

const { voidPaymentMock, findPaymentByIdMock } = vi.hoisted(() => ({
  voidPaymentMock: vi.fn(),
  findPaymentByIdMock: vi.fn(),
}));
vi.mock("@/lib/core/payments/payment.service", () => ({
  voidPayment: voidPaymentMock,
  findPaymentById: findPaymentByIdMock,
}));

import { paymentVoidHandler } from "../payment-void-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "payment.void",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["payments.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("paymentVoidHandler", () => {
  beforeEach(() => {
    voidPaymentMock.mockReset();
    findPaymentByIdMock.mockReset();
  });

  it("voids the addressed pending payment through the canonical service", async () => {
    findPaymentByIdMock.mockResolvedValue({ id: "pay1", status: "PENDING" });
    voidPaymentMock.mockResolvedValue({ id: "pay1", status: "CANCELLED" });

    const result = await paymentVoidHandler(envelope({ paymentId: "pay1" }));

    expect(voidPaymentMock).toHaveBeenCalledWith({ paymentId: "pay1", organizationId: "org-1" });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "payment", entityId: "pay1" } });
  });

  it("reports NO_CHANGE without a second mutation when already cancelled", async () => {
    findPaymentByIdMock.mockResolvedValue({ id: "pay1", status: "CANCELLED" });

    const result = await paymentVoidHandler(envelope({ paymentId: "pay1" }));

    expect(voidPaymentMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "SUCCESS", resultOutcome: "NO_CHANGE" });
  });

  it("rejects a missing paymentId before mutation", async () => {
    await expect(paymentVoidHandler(envelope({}))).rejects.toThrow(/paymentId/);
    expect(voidPaymentMock).not.toHaveBeenCalled();
  });
});
