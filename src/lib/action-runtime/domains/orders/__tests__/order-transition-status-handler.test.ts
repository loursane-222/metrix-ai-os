import { beforeEach, describe, expect, it, vi } from "vitest";

const { transitionOrderStatusMock } = vi.hoisted(() => ({ transitionOrderStatusMock: vi.fn() }));
vi.mock("@/lib/core/orders/order.service", () => ({ transitionOrderStatus: transitionOrderStatusMock }));

import { handleOrderTransitionStatus } from "../order-transition-status-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "order.transitionStatus",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["orders.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleOrderTransitionStatus", () => {
  beforeEach(() => transitionOrderStatusMock.mockReset());

  it("transitions the addressed order through the canonical service", async () => {
    transitionOrderStatusMock.mockResolvedValue({ id: "order-1", status: "APPROVED" });

    const result = await handleOrderTransitionStatus(envelope({ orderId: "order-1", toStatus: "APPROVED" }));

    expect(transitionOrderStatusMock).toHaveBeenCalledWith({ orderId: "order-1", organizationId: "org-1", toStatus: "APPROVED", reason: undefined });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "order", entityId: "order-1" } });
  });

  it("rejects an unknown status value before mutation", async () => {
    await expect(handleOrderTransitionStatus(envelope({ orderId: "order-1", toStatus: "MADE_UP" }))).rejects.toThrow(/toStatus/);
    expect(transitionOrderStatusMock).not.toHaveBeenCalled();
  });

  it("rejects a missing orderId before mutation", async () => {
    await expect(handleOrderTransitionStatus(envelope({ toStatus: "APPROVED" }))).rejects.toThrow(/orderId/);
    expect(transitionOrderStatusMock).not.toHaveBeenCalled();
  });
});
