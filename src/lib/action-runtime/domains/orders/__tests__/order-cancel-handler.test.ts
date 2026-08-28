import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { cancelOrderMock } = vi.hoisted(() => ({ cancelOrderMock: vi.fn() }));
vi.mock("@/lib/core/orders/order.service", () => ({ cancelOrder: cancelOrderMock }));

import { handleOrderCancel } from "../order-cancel-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "order.cancel",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["orders.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleOrderCancel", () => {
  beforeEach(() => cancelOrderMock.mockReset());

  it("cancels the addressed order through the canonical service", async () => {
    cancelOrderMock.mockResolvedValue({ id: "order-1", status: "CANCELLED" });

    const result = await handleOrderCancel(envelope({ orderId: "order-1", reason: "Müşteri vazgeçti" }));

    expect(cancelOrderMock).toHaveBeenCalledWith({ orderId: "order-1", organizationId: "org-1", reason: "Müşteri vazgeçti" });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "order", entityId: "order-1" } });
  });

  it("rejects a missing reason before mutation (no unexplained cancellations)", async () => {
    await expect(handleOrderCancel(envelope({ orderId: "order-1" }))).rejects.toThrow(/reason/);
    expect(cancelOrderMock).not.toHaveBeenCalled();
  });
});
