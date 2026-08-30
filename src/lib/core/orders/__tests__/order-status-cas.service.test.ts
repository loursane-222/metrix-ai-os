import { describe, expect, it, vi, beforeEach } from "vitest";

const { updateOrderStatusMock, recordStatusTransitionMock, getOrderByIdMock, reserveStockForOrderMock, releaseStockForOrderMock, refreshOrderIntelligenceMock } = vi.hoisted(() => ({
  updateOrderStatusMock: vi.fn(),
  recordStatusTransitionMock: vi.fn(),
  getOrderByIdMock: vi.fn(),
  reserveStockForOrderMock: vi.fn(),
  releaseStockForOrderMock: vi.fn(),
  refreshOrderIntelligenceMock: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(currentTx)) },
}));

vi.mock("../order.repository", async () => {
  const actual = await vi.importActual<typeof import("../order.repository")>("../order.repository");
  return {
    ...actual,
    updateOrderStatus: updateOrderStatusMock,
    recordStatusTransition: recordStatusTransitionMock,
    getOrderById: getOrderByIdMock,
  };
});

vi.mock("@/lib/core/stock/stock.service", () => ({
  reserveStockForOrder: reserveStockForOrderMock,
  releaseStockForOrder: releaseStockForOrderMock,
}));

vi.mock("../order-intelligence.service", () => ({ refreshOrderIntelligence: refreshOrderIntelligenceMock }));

import { OrderConcurrentlyModifiedError } from "../order.repository";
import { cancelOrder, transitionOrderStatus } from "../order.service";

let currentTx: { order: { findFirst: ReturnType<typeof vi.fn> } };

function setOrderRead(order: { status: string }) {
  currentTx = { order: { findFirst: vi.fn().mockResolvedValue(order) } };
  return currentTx;
}

describe("Order status transition concurrency (CAS)", () => {
  beforeEach(() => {
    updateOrderStatusMock.mockReset();
    recordStatusTransitionMock.mockReset();
    getOrderByIdMock.mockReset();
    reserveStockForOrderMock.mockReset();
    releaseStockForOrderMock.mockReset();
    refreshOrderIntelligenceMock.mockReset();
  });

  it("transitionOrderStatus passes the just-read status as the CAS fromStatus", async () => {
    const tx = setOrderRead({ status: "PENDING_APPROVAL" });
    updateOrderStatusMock.mockResolvedValue({ count: 1 });
    getOrderByIdMock.mockResolvedValue({ id: "order-1" });

    await transitionOrderStatus({ orderId: "order-1", organizationId: "org-1", toStatus: "APPROVED" });

    expect(updateOrderStatusMock).toHaveBeenCalledWith("order-1", "org-1", "PENDING_APPROVAL", "APPROVED", {}, tx);
    expect(reserveStockForOrderMock).toHaveBeenCalledWith("order-1", "org-1", tx);
  });

  it("surfaces a concurrent transition as a 409, without reserving stock a second time", async () => {
    setOrderRead({ status: "PENDING_APPROVAL" });
    updateOrderStatusMock.mockRejectedValue(new OrderConcurrentlyModifiedError("order-1"));

    await expect(transitionOrderStatus({ orderId: "order-1", organizationId: "org-1", toStatus: "APPROVED" })).rejects.toMatchObject({ status: 409 });
    expect(reserveStockForOrderMock).not.toHaveBeenCalled();
    expect(recordStatusTransitionMock).not.toHaveBeenCalled();
  });

  it("cancelOrder releases the still-reserved stock after a successful cancellation", async () => {
    const tx = setOrderRead({ status: "APPROVED" });
    updateOrderStatusMock.mockResolvedValue({ count: 1 });
    getOrderByIdMock.mockResolvedValue({ id: "order-1", status: "CANCELLED" });

    await cancelOrder({ orderId: "order-1", organizationId: "org-1", reason: "customer request" });

    expect(updateOrderStatusMock).toHaveBeenCalledWith("order-1", "org-1", "APPROVED", "CANCELLED", { cancellationReason: "customer request" }, tx);
    expect(releaseStockForOrderMock).toHaveBeenCalledWith("order-1", "org-1", tx);
  });

  it("surfaces a concurrent cancel as a 409 and never releases stock for a cancellation that did not commit", async () => {
    setOrderRead({ status: "APPROVED" });
    updateOrderStatusMock.mockRejectedValue(new OrderConcurrentlyModifiedError("order-1"));

    await expect(cancelOrder({ orderId: "order-1", organizationId: "org-1", reason: "customer request" })).rejects.toMatchObject({ status: 409 });
    expect(releaseStockForOrderMock).not.toHaveBeenCalled();
    expect(recordStatusTransitionMock).not.toHaveBeenCalled();
  });
});
