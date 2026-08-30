import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  createDeliveryMock, createDeliveryItemsMock, generateDeliveryNumberMock, recordDeliveryStatusTransitionMock, getDeliveryByIdMock, updateDeliveryStatusMock,
  consumeStockForDeliveryMock, refreshDeliveryIntelligenceMock,
} = vi.hoisted(() => ({
  createDeliveryMock: vi.fn(),
  createDeliveryItemsMock: vi.fn(),
  generateDeliveryNumberMock: vi.fn().mockResolvedValue("IRS-0001"),
  recordDeliveryStatusTransitionMock: vi.fn(),
  getDeliveryByIdMock: vi.fn().mockResolvedValue({ id: "delivery-1" }),
  updateDeliveryStatusMock: vi.fn().mockResolvedValue({ count: 1 }),
  consumeStockForDeliveryMock: vi.fn(),
  refreshDeliveryIntelligenceMock: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(currentTx)) },
}));

vi.mock("../delivery.repository", async () => {
  const actual = await vi.importActual<typeof import("../delivery.repository")>("../delivery.repository");
  return {
    ...actual,
    createDelivery: createDeliveryMock,
    createDeliveryItems: createDeliveryItemsMock,
    generateDeliveryNumber: generateDeliveryNumberMock,
    recordDeliveryStatusTransition: recordDeliveryStatusTransitionMock,
    getDeliveryById: getDeliveryByIdMock,
    updateDeliveryStatus: updateDeliveryStatusMock,
  };
});

vi.mock("@/lib/core/stock/stock.service", () => ({ consumeStockForDelivery: consumeStockForDeliveryMock }));
vi.mock("../delivery-intelligence.service", () => ({ refreshDeliveryIntelligence: refreshDeliveryIntelligenceMock }));

import { createDeliveryFromOrder } from "../delivery.service";

const order = {
  id: "order-1",
  organizationId: "org-1",
  customerId: "cust-1",
  status: "READY",
  items: [
    { id: "item-1", quantity: 10, productServiceId: "prod-1", name: "Item 1", unit: "adet", sortOrder: 0 },
    { id: "item-2", quantity: 5, productServiceId: "prod-2", name: "Item 2", unit: "adet", sortOrder: 1 },
  ],
};

let currentTx: {
  order: { findFirst: ReturnType<typeof vi.fn> };
  deliveryItem: { findMany: ReturnType<typeof vi.fn> };
  $queryRaw: ReturnType<typeof vi.fn>;
};

function setupTx(alreadyShippedByItem: Record<string, number> = {}) {
  currentTx = {
    order: { findFirst: vi.fn().mockResolvedValue(order) },
    deliveryItem: {
      findMany: vi.fn(({ where }: { where: { orderItemId?: string; deliveryId?: string } }) => {
        if (where.deliveryId) return Promise.resolve([]); // autoDispatch's createdItems read
        const already = alreadyShippedByItem[where.orderItemId ?? ""] ?? 0;
        return Promise.resolve(already > 0 ? [{ quantity: already }] : []);
      }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  return currentTx;
}

describe("createDeliveryFromOrder — Phase 6 overshipping concurrency fix", () => {
  beforeEach(() => {
    createDeliveryMock.mockReset().mockResolvedValue({ id: "delivery-1" });
    createDeliveryItemsMock.mockReset();
    recordDeliveryStatusTransitionMock.mockReset();
    updateDeliveryStatusMock.mockReset().mockResolvedValue({ count: 1 });
    consumeStockForDeliveryMock.mockReset();
    refreshDeliveryIntelligenceMock.mockReset();
    getDeliveryByIdMock.mockReset().mockResolvedValue({ id: "delivery-1" });
  });

  it("acquires a row lock on every requested OrderItem before reading already-shipped sums", async () => {
    const tx = setupTx();

    await createDeliveryFromOrder({ organizationId: "org-1", sourceOrderId: "order-1", items: [{ orderItemId: "item-1", quantity: 4 }] });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const lockCallOrder = tx.$queryRaw.mock.invocationCallOrder[0]!;
    const sumCallOrder = tx.deliveryItem.findMany.mock.invocationCallOrder[0]!;
    expect(lockCallOrder).toBeLessThan(sumCallOrder);
  });

  it("locks the deduplicated union of every OrderItem id referenced by the request, for a multi-line order", async () => {
    const tx = setupTx();

    await createDeliveryFromOrder({
      organizationId: "org-1",
      sourceOrderId: "order-1",
      items: [
        { orderItemId: "item-1", quantity: 2 },
        { orderItemId: "item-2", quantity: 1 },
      ],
    });

    const [, lockedIds, lockedOrgId] = tx.$queryRaw.mock.calls[0]!;
    expect(new Set(lockedIds as string[])).toEqual(new Set(["item-1", "item-2"]));
    expect(lockedOrgId).toBe("org-1");
  });

  it("still rejects a single call whose requested quantity exceeds the OrderItem ceiling (regression, sequential case)", async () => {
    setupTx({ "item-1": 8 });

    await expect(
      createDeliveryFromOrder({ organizationId: "org-1", sourceOrderId: "order-1", items: [{ orderItemId: "item-1", quantity: 4 }] }),
    ).rejects.toThrow(/Sevk edilen miktar sipariş miktarını aşıyor/);
  });

  it("a fresh sum-read after the lock correctly rejects the second of two sequential calls once the first's shipment is already committed", async () => {
    // Simulates what the row lock guarantees: by the time the second call's
    // sum-check runs, it observes the first call's now-committed DISPATCHED
    // delivery — exactly the state a concurrent second caller would see
    // after being unblocked by the first call's lock release on commit.
    setupTx({ "item-1": 6 });

    await expect(
      createDeliveryFromOrder({ organizationId: "org-1", sourceOrderId: "order-1", items: [{ orderItemId: "item-1", quantity: 6 }] }),
    ).rejects.toThrow(/Sevk edilen miktar sipariş miktarını aşıyor/);
  });

  it("still allows a delivery that fits within the ceiling (regression)", async () => {
    setupTx({ "item-1": 2 });

    await createDeliveryFromOrder({ organizationId: "org-1", sourceOrderId: "order-1", items: [{ orderItemId: "item-1", quantity: 4 }] });

    expect(createDeliveryMock).toHaveBeenCalled();
  });

  it("createDeliveryFromOrder itself never touches Stock — only consumeStockForDelivery does, and only when autoDispatch is set", async () => {
    setupTx();
    await createDeliveryFromOrder({ organizationId: "org-1", sourceOrderId: "order-1", items: [{ orderItemId: "item-1", quantity: 3 }] });
    expect(consumeStockForDeliveryMock).not.toHaveBeenCalled();

    setupTx();
    await createDeliveryFromOrder({ organizationId: "org-1", sourceOrderId: "order-1", items: [{ orderItemId: "item-1", quantity: 3 }], autoDispatch: true });
    expect(consumeStockForDeliveryMock).toHaveBeenCalledTimes(1);
  });
});
