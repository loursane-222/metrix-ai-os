import { describe, expect, it, vi, beforeEach } from "vitest";

const { createDeliveryMock, createDeliveryItemsMock, generateDeliveryNumberMock, recordDeliveryStatusTransitionMock, getDeliveryByIdMock, refreshDeliveryIntelligenceMock } = vi.hoisted(() => ({
  createDeliveryMock: vi.fn().mockResolvedValue({ id: "delivery-1" }),
  createDeliveryItemsMock: vi.fn(),
  generateDeliveryNumberMock: vi.fn().mockResolvedValue("IRS-0001"),
  recordDeliveryStatusTransitionMock: vi.fn(),
  getDeliveryByIdMock: vi.fn().mockResolvedValue({ id: "delivery-1" }),
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
  };
});

vi.mock("@/lib/core/stock/stock.service", () => ({ consumeStockForDelivery: vi.fn() }));
vi.mock("../delivery-intelligence.service", () => ({ refreshDeliveryIntelligence: refreshDeliveryIntelligenceMock }));

import { createNewDelivery } from "../delivery.service";

function makeOrder(status: string) {
  return {
    id: "order-1",
    organizationId: "org-1",
    status,
    items: [{ id: "item-1", quantity: 10, productServiceId: "prod-1", name: "Item 1", unit: "adet", sortOrder: 0 }],
  };
}

let currentTx: { order: { findFirst: ReturnType<typeof vi.fn> } } & { deliveryItem: { findMany: ReturnType<typeof vi.fn> } } & { $queryRaw: ReturnType<typeof vi.fn> };

function setupTx(alreadyShipped = 0, status = "READY") {
  currentTx = {
    order: { findFirst: vi.fn().mockResolvedValue(makeOrder(status)) },
    deliveryItem: { findMany: vi.fn().mockResolvedValue(alreadyShipped > 0 ? [{ quantity: alreadyShipped }] : []) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  return currentTx;
}

describe("createNewDelivery — closes the second Order-linked overshipping path", () => {
  beforeEach(() => {
    createDeliveryMock.mockReset().mockResolvedValue({ id: "delivery-1" });
    createDeliveryItemsMock.mockReset();
    recordDeliveryStatusTransitionMock.mockReset();
    getDeliveryByIdMock.mockReset().mockResolvedValue({ id: "delivery-1" });
    refreshDeliveryIntelligenceMock.mockReset();
  });

  it("preserves today's real caller behavior unchanged: empty items never touches Order or the lock", async () => {
    const tx = setupTx();

    await createNewDelivery({ organizationId: "org-1", sourceOrderId: "order-1", customerId: "cust-1", items: [] });

    expect(tx.order.findFirst).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(createDeliveryItemsMock).not.toHaveBeenCalled();
  });

  it("rejects a delivery whose items would exceed the OrderItem's deliverable ceiling — same guard as createDeliveryFromOrder", async () => {
    setupTx(8);

    await expect(
      createNewDelivery({
        organizationId: "org-1",
        sourceOrderId: "order-1",
        customerId: "cust-1",
        items: [{ orderItemId: "item-1", name: "Item 1", quantity: 4 }],
      }),
    ).rejects.toThrow(/Sevk edilen miktar sipariş miktarını aşıyor/);

    expect(createDeliveryItemsMock).not.toHaveBeenCalled();
  });

  it("rejects an item that does not belong to the target order", async () => {
    setupTx();

    await expect(
      createNewDelivery({
        organizationId: "org-1",
        sourceOrderId: "order-1",
        customerId: "cust-1",
        items: [{ orderItemId: "item-from-another-order", name: "Foreign item", quantity: 1 }],
      }),
    ).rejects.toThrow(/does not belong to this order/);
  });

  it("acquires the same FOR UPDATE row lock as createDeliveryFromOrder before validating", async () => {
    const tx = setupTx();

    await createNewDelivery({
      organizationId: "org-1",
      sourceOrderId: "order-1",
      customerId: "cust-1",
      items: [{ orderItemId: "item-1", name: "Item 1", quantity: 4 }],
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0]!;
    const sumOrder = tx.deliveryItem.findMany.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(sumOrder);
    expect(createDeliveryItemsMock).toHaveBeenCalled();
  });

  it("STATUS GATE: allows delivery items when the source Order is in an allowed shippable status (READY)", async () => {
    setupTx(0, "READY");

    await createNewDelivery({
      organizationId: "org-1",
      sourceOrderId: "order-1",
      customerId: "cust-1",
      items: [{ orderItemId: "item-1", name: "Item 1", quantity: 4 }],
    });

    expect(createDeliveryItemsMock).toHaveBeenCalled();
  });

  it("STATUS GATE: allows delivery items when the source Order is PARTIALLY_SHIPPED (the other allowed status)", async () => {
    setupTx(0, "PARTIALLY_SHIPPED");

    await createNewDelivery({
      organizationId: "org-1",
      sourceOrderId: "order-1",
      customerId: "cust-1",
      items: [{ orderItemId: "item-1", name: "Item 1", quantity: 4 }],
    });

    expect(createDeliveryItemsMock).toHaveBeenCalled();
  });

  it("STATUS GATE: rejects delivery items when the source Order is DRAFT", async () => {
    setupTx(0, "DRAFT");

    await expect(
      createNewDelivery({
        organizationId: "org-1",
        sourceOrderId: "order-1",
        customerId: "cust-1",
        items: [{ orderItemId: "item-1", name: "Item 1", quantity: 4 }],
      }),
    ).rejects.toThrow(/Order in status DRAFT cannot be shipped/);

    expect(createDeliveryItemsMock).not.toHaveBeenCalled();
  });

  it("STATUS GATE: rejects delivery items when the source Order is CANCELLED", async () => {
    setupTx(0, "CANCELLED");

    await expect(
      createNewDelivery({
        organizationId: "org-1",
        sourceOrderId: "order-1",
        customerId: "cust-1",
        items: [{ orderItemId: "item-1", name: "Item 1", quantity: 4 }],
      }),
    ).rejects.toThrow(/Order in status CANCELLED cannot be shipped/);

    expect(createDeliveryItemsMock).not.toHaveBeenCalled();
  });

  it("REGRESSION: the status gate never runs for the current empty-items production path", async () => {
    const tx = setupTx(0, "DRAFT"); // even a non-shippable order must not block the empty-items path

    await createNewDelivery({ organizationId: "org-1", sourceOrderId: "order-1", customerId: "cust-1", items: [] });

    expect(tx.order.findFirst).not.toHaveBeenCalled();
    expect(createDeliveryMock).toHaveBeenCalled();
  });

  it("throws Order not found for items pointing at a non-existent order rather than silently creating an unlinked delivery", async () => {
    currentTx = {
      order: { findFirst: vi.fn().mockResolvedValue(null) },
      deliveryItem: { findMany: vi.fn() },
      $queryRaw: vi.fn(),
    };

    await expect(
      createNewDelivery({ organizationId: "org-1", sourceOrderId: "missing-order", customerId: "cust-1", items: [{ orderItemId: "item-1", name: "Item 1", quantity: 1 }] }),
    ).rejects.toThrow("Order not found.");
  });
});
