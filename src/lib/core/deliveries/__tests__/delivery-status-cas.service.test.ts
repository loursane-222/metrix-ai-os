import { describe, expect, it, vi, beforeEach } from "vitest";

const { updateDeliveryStatusMock, recordDeliveryStatusTransitionMock, getDeliveryByIdMock, consumeStockForDeliveryMock, refreshDeliveryIntelligenceMock, transitionOrderStatusMock } = vi.hoisted(() => ({
  updateDeliveryStatusMock: vi.fn(),
  recordDeliveryStatusTransitionMock: vi.fn(),
  getDeliveryByIdMock: vi.fn(),
  consumeStockForDeliveryMock: vi.fn(),
  refreshDeliveryIntelligenceMock: vi.fn(),
  transitionOrderStatusMock: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(currentTx)) },
}));

vi.mock("../delivery.repository", async () => {
  const actual = await vi.importActual<typeof import("../delivery.repository")>("../delivery.repository");
  return {
    ...actual,
    updateDeliveryStatus: updateDeliveryStatusMock,
    recordDeliveryStatusTransition: recordDeliveryStatusTransitionMock,
    getDeliveryById: getDeliveryByIdMock,
  };
});

vi.mock("@/lib/core/stock/stock.service", () => ({ consumeStockForDelivery: consumeStockForDeliveryMock }));
vi.mock("@/lib/core/orders/order.service", () => ({ transitionOrderStatus: transitionOrderStatusMock }));
vi.mock("../delivery-intelligence.service", () => ({ refreshDeliveryIntelligence: refreshDeliveryIntelligenceMock }));

import { DeliveryConcurrentlyModifiedError } from "../delivery.repository";
import { cancelDelivery, transitionDeliveryStatus } from "../delivery.service";

let currentTx: { delivery: { findFirst: ReturnType<typeof vi.fn> }; order: { findFirst: ReturnType<typeof vi.fn> } };

function setDeliveryRead(delivery: { status: string; items?: unknown[]; sourceOrderId?: string }) {
  currentTx = {
    delivery: { findFirst: vi.fn().mockResolvedValue({ items: [], sourceOrderId: "order-1", ...delivery }) },
    order: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  return currentTx;
}

describe("Delivery status transition concurrency (CAS)", () => {
  beforeEach(() => {
    updateDeliveryStatusMock.mockReset();
    recordDeliveryStatusTransitionMock.mockReset();
    getDeliveryByIdMock.mockReset();
    consumeStockForDeliveryMock.mockReset();
    refreshDeliveryIntelligenceMock.mockReset();
    transitionOrderStatusMock.mockReset();
  });

  it("transitionDeliveryStatus passes the just-read status as the CAS fromStatus", async () => {
    const tx = setDeliveryRead({ status: "LOADED" });
    updateDeliveryStatusMock.mockResolvedValue({ count: 1 });
    getDeliveryByIdMock.mockResolvedValue({ id: "delivery-1" });

    await transitionDeliveryStatus({ deliveryId: "delivery-1", organizationId: "org-1", toStatus: "DISPATCHED" });

    expect(updateDeliveryStatusMock).toHaveBeenCalledWith("delivery-1", "org-1", "LOADED", "DISPATCHED", { dispatchedAt: expect.any(Date) }, tx);
    expect(consumeStockForDeliveryMock).toHaveBeenCalledWith("delivery-1", "org-1", tx);
  });

  it("surfaces a concurrent dispatch as a 409, without consuming stock a second time", async () => {
    setDeliveryRead({ status: "LOADED" });
    updateDeliveryStatusMock.mockRejectedValue(new DeliveryConcurrentlyModifiedError("delivery-1"));

    await expect(transitionDeliveryStatus({ deliveryId: "delivery-1", organizationId: "org-1", toStatus: "DISPATCHED" })).rejects.toMatchObject({ status: 409 });
    expect(consumeStockForDeliveryMock).not.toHaveBeenCalled();
    expect(recordDeliveryStatusTransitionMock).not.toHaveBeenCalled();
  });

  it("surfaces a concurrent cancel as a 409", async () => {
    setDeliveryRead({ status: "DRAFT" });
    updateDeliveryStatusMock.mockRejectedValue(new DeliveryConcurrentlyModifiedError("delivery-1"));

    await expect(cancelDelivery({ deliveryId: "delivery-1", organizationId: "org-1", reason: "customer request" })).rejects.toMatchObject({ status: 409 });
    expect(recordDeliveryStatusTransitionMock).not.toHaveBeenCalled();
  });
});
