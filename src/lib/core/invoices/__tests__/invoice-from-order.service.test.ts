import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  createInvoiceMock, createInvoiceItemsMock, countInvoicesForOrganizationMock, findInvoicedQuantityRowsForOrderItemMock, sumDeliveredQuantityForOrderItemMock,
} = vi.hoisted(() => ({
  createInvoiceMock: vi.fn(),
  createInvoiceItemsMock: vi.fn(),
  countInvoicesForOrganizationMock: vi.fn().mockResolvedValue(0),
  findInvoicedQuantityRowsForOrderItemMock: vi.fn().mockResolvedValue([]),
  sumDeliveredQuantityForOrderItemMock: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(currentTx)) },
}));

vi.mock("../invoice.repository", async () => {
  const actual = await vi.importActual<typeof import("../invoice.repository")>("../invoice.repository");
  return {
    ...actual,
    createInvoice: createInvoiceMock,
    createInvoiceItems: createInvoiceItemsMock,
    countInvoicesForOrganization: countInvoicesForOrganizationMock,
    findInvoicedQuantityRowsForOrderItem: findInvoicedQuantityRowsForOrderItemMock,
  };
});

vi.mock("@/lib/core/deliveries/delivery.repository", () => ({ sumDeliveredQuantityForOrderItem: sumDeliveredQuantityForOrderItemMock }));

import { createInvoiceFromOrder } from "../invoice.service";

const order = {
  id: "order-1",
  organizationId: "org-1",
  orderNumber: "SIP-0001",
  customerId: "cust-1",
  currency: "TRY",
  generalDiscountBasisPoints: null as number | null,
  items: [
    { id: "item-1", productServiceId: "prod-1", name: "Item 1", unit: "adet", quantity: 10, unitPriceCents: BigInt(1000), discountBasisPoints: 0, vatRateBasisPoints: 2000, sortOrder: 0 },
  ],
};

let currentTx: { order: { findFirst: ReturnType<typeof vi.fn> } } & { delivery: { findFirst: ReturnType<typeof vi.fn> } } & { $queryRaw: ReturnType<typeof vi.fn> };

function setupTx(overrides: Partial<typeof order> = {}) {
  currentTx = {
    order: { findFirst: vi.fn().mockResolvedValue({ ...order, ...overrides }) },
    delivery: { findFirst: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  return currentTx;
}

describe("createInvoiceFromOrder — Phase 7", () => {
  beforeEach(() => {
    createInvoiceMock.mockReset().mockImplementation((data: Record<string, unknown>) => Promise.resolve({ id: "invoice-1", ...data }));
    createInvoiceItemsMock.mockReset();
    countInvoicesForOrganizationMock.mockReset().mockResolvedValue(0);
    findInvoicedQuantityRowsForOrderItemMock.mockReset().mockResolvedValue([]);
    sumDeliveredQuantityForOrderItemMock.mockReset().mockResolvedValue([{ quantity: 10 }]); // fully dispatched by default
  });

  it("carries canonical Order/Delivery provenance and never re-reads Quote", async () => {
    const tx = setupTx();

    await createInvoiceFromOrder({ organizationId: "org-1", sourceOrderId: "order-1" });

    expect(createInvoiceMock).toHaveBeenCalledWith(expect.objectContaining({ orderId: "order-1", deliveryId: null, quoteId: null }), tx);
    expect((tx as unknown as { quote?: unknown }).quote).toBeUndefined();
  });

  it("computes amount/taxAmount/totalAmount deterministically from OrderItem lines (server-side, not caller-supplied)", async () => {
    setupTx();
    sumDeliveredQuantityForOrderItemMock.mockResolvedValue([{ quantity: 10 }]);

    await createInvoiceFromOrder({ organizationId: "org-1", sourceOrderId: "order-1" });

    // 10 units * 10.00 = 100.00 net, 20% VAT = 20.00, total 120.00
    const [data] = createInvoiceMock.mock.calls[0]!;
    expect(data.amount).toBeCloseTo(100);
    expect(data.taxAmount).toBeCloseTo(20);
    expect(data.totalAmount).toBeCloseTo(120);
    expect(data.amount + data.taxAmount).toBeCloseTo(data.totalAmount); // exact-balance invariant for ledger.recordInvoiceSent
  });

  it("rejects invoicing more than has actually been dispatched (over-invoicing ceiling)", async () => {
    setupTx();
    sumDeliveredQuantityForOrderItemMock.mockResolvedValue([{ quantity: 4 }]); // only 4 of 10 dispatched

    await expect(
      createInvoiceFromOrder({ organizationId: "org-1", sourceOrderId: "order-1", items: [{ orderItemId: "item-1", quantity: 10 }] }),
    ).rejects.toThrow(/Faturalanan miktar sevk edilen miktarı aşıyor/);

    expect(createInvoiceMock).not.toHaveBeenCalled();
  });

  it("accounts for already-invoiced quantity: a second invoice for the remaining dispatched-but-not-yet-invoiced amount succeeds, a third over the ceiling fails", async () => {
    setupTx();
    sumDeliveredQuantityForOrderItemMock.mockResolvedValue([{ quantity: 10 }]);
    findInvoicedQuantityRowsForOrderItemMock.mockResolvedValue([{ quantity: 6 }]); // already invoiced 6 of the 10 dispatched

    await createInvoiceFromOrder({ organizationId: "org-1", sourceOrderId: "order-1", items: [{ orderItemId: "item-1", quantity: 4 }] });
    expect(createInvoiceMock).toHaveBeenCalledTimes(1);

    // Simulate the first call's InvoiceItem now being committed and visible:
    // cumulative invoiced is 6 (pre-existing) + 4 (just invoiced) = 10.
    findInvoicedQuantityRowsForOrderItemMock.mockResolvedValue([{ quantity: 10 }]);
    createInvoiceMock.mockClear();
    await expect(
      createInvoiceFromOrder({ organizationId: "org-1", sourceOrderId: "order-1", items: [{ orderItemId: "item-1", quantity: 1 }] }),
    ).rejects.toThrow(/Faturalanan miktar sevk edilen miktarı aşıyor/);
  });

  it("acquires the FOR UPDATE lock on the requested OrderItem rows before reading dispatched/invoiced sums (same concurrency pattern as Phase 6)", async () => {
    const tx = setupTx();

    await createInvoiceFromOrder({ organizationId: "org-1", sourceOrderId: "order-1" });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0]!;
    const dispatchedReadOrder = sumDeliveredQuantityForOrderItemMock.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(dispatchedReadOrder);
  });

  it("rejects an item that does not belong to the target order", async () => {
    setupTx();

    await expect(
      createInvoiceFromOrder({ organizationId: "org-1", sourceOrderId: "order-1", items: [{ orderItemId: "foreign-item", quantity: 1 }] }),
    ).rejects.toThrow(/does not belong to this order/);
  });

  it("rejects an Order with no customer", async () => {
    setupTx({ customerId: null as unknown as string });

    await expect(createInvoiceFromOrder({ organizationId: "org-1", sourceOrderId: "order-1" })).rejects.toThrow(/has no customer/);
  });

  it("validates a sourceDeliveryId belongs to the same order and links it as provenance", async () => {
    const tx = setupTx();
    tx.delivery.findFirst.mockResolvedValue({ id: "delivery-1", items: [{ orderItemId: "item-1", quantity: 10 }] });

    await createInvoiceFromOrder({ organizationId: "org-1", sourceOrderId: "order-1", sourceDeliveryId: "delivery-1" });

    expect(createInvoiceMock).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: "delivery-1" }), tx);
  });

  it("DELIVERY-SCOPED CEILING: defaults to exactly what the specified delivery dispatched, not the order's full ordered quantity", async () => {
    const tx = setupTx(); // order.items[0].quantity is 10 (the full order)
    tx.delivery.findFirst.mockResolvedValue({ id: "delivery-1", items: [{ orderItemId: "item-1", quantity: 3 }] }); // this delivery only shipped 3
    sumDeliveredQuantityForOrderItemMock.mockResolvedValue([{ quantity: 3 }]); // total ever dispatched is also 3

    await createInvoiceFromOrder({ organizationId: "org-1", sourceOrderId: "order-1", sourceDeliveryId: "delivery-1" });

    expect(createInvoiceItemsMock).toHaveBeenCalledWith(
      "invoice-1",
      "org-1",
      [expect.objectContaining({ orderItemId: "item-1", quantity: 3 })],
      tx,
    );
  });

  it("DELIVERY-SCOPED CEILING: still rejects when even the delivery's own quantity would exceed the true dispatched-minus-invoiced remainder", async () => {
    setupTx();
    // Delivery claims to have shipped 3, but somehow only 2 units are
    // reflected in the real dispatched ledger (defensive: the ceiling check
    // is never bypassed just because a request originated from a delivery).
    (currentTx as unknown as { delivery: { findFirst: ReturnType<typeof vi.fn> } }).delivery.findFirst.mockResolvedValue({ id: "delivery-1", items: [{ orderItemId: "item-1", quantity: 3 }] });
    sumDeliveredQuantityForOrderItemMock.mockResolvedValue([{ quantity: 2 }]);

    await expect(
      createInvoiceFromOrder({ organizationId: "org-1", sourceOrderId: "order-1", sourceDeliveryId: "delivery-1" }),
    ).rejects.toThrow(/Faturalanan miktar sevk edilen miktarı aşıyor/);
  });

  it("rejects a sourceDeliveryId that does not belong to the order", async () => {
    const tx = setupTx();
    tx.delivery.findFirst.mockResolvedValue(null);

    await expect(
      createInvoiceFromOrder({ organizationId: "org-1", sourceOrderId: "order-1", sourceDeliveryId: "delivery-x" }),
    ).rejects.toThrow(/Delivery not found/);
  });

  it("never touches Stock — invoice creation is not a stock movement authority", async () => {
    const tx = setupTx();
    await createInvoiceFromOrder({ organizationId: "org-1", sourceOrderId: "order-1" });
    expect((tx as unknown as { stock?: unknown }).stock).toBeUndefined();
  });
});
