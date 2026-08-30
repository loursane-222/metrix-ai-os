import { describe, expect, it, vi, beforeEach } from "vitest";

const { updateGoodsReceiptStatusMock, reverseGoodsReceiptStockMock, findInvoicedQuantityRowsForPurchaseOrderItemMock } = vi.hoisted(() => ({
  updateGoodsReceiptStatusMock: vi.fn(),
  reverseGoodsReceiptStockMock: vi.fn(),
  findInvoicedQuantityRowsForPurchaseOrderItemMock: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(currentTx)) },
}));

vi.mock("../goods-receipt.repository", async () => {
  const actual = await vi.importActual<typeof import("../goods-receipt.repository")>("../goods-receipt.repository");
  return { ...actual, updateGoodsReceiptStatus: updateGoodsReceiptStatusMock };
});

vi.mock("@/lib/core/stock/stock.service", () => ({ receiveStock: vi.fn(), reverseGoodsReceiptStock: reverseGoodsReceiptStockMock }));

vi.mock("@/lib/core/purchase-invoices/purchase-invoice.repository", () => ({ findInvoicedQuantityRowsForPurchaseOrderItem: findInvoicedQuantityRowsForPurchaseOrderItemMock }));

import { cancelGoodsReceipt } from "../goods-receipt.service";

const goodsReceipt = {
  id: "gr-1",
  organizationId: "org-1",
  status: "RECEIVED",
  warehouseId: "wh-1",
  sourcePurchaseOrderId: "po-1",
  items: [{ purchaseOrderItemId: "poi-1", productServiceId: "prod-1", name: "Item 1", quantity: 6 }],
};

let currentTx: {
  goodsReceipt: { findFirst: ReturnType<typeof vi.fn> };
  goodsReceiptItem: { findMany: ReturnType<typeof vi.fn> };
  purchaseOrder: { findFirst: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
};

function setupTx(overrides: Partial<typeof goodsReceipt> = {}) {
  currentTx = {
    goodsReceipt: { findFirst: vi.fn().mockResolvedValue({ ...goodsReceipt, ...overrides }) },
    goodsReceiptItem: { findMany: vi.fn().mockResolvedValue([]) },
    purchaseOrder: {
      findFirst: vi.fn().mockResolvedValue({ id: "po-1", organizationId: "org-1", status: "RECEIVED", items: [{ id: "poi-1", quantity: 6 }] }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return currentTx;
}

describe("cancelGoodsReceipt — Phase 9 adversarial fix: cannot cancel an already-invoiced receipt", () => {
  beforeEach(() => {
    updateGoodsReceiptStatusMock.mockReset().mockResolvedValue({ count: 1 });
    reverseGoodsReceiptStockMock.mockReset();
    findInvoicedQuantityRowsForPurchaseOrderItemMock.mockReset().mockResolvedValue([]);
  });

  it("cancels and reverses stock when nothing has been invoiced yet", async () => {
    setupTx();
    await cancelGoodsReceipt({ goodsReceiptId: "gr-1", organizationId: "org-1", reason: "yanlış kayıt" });

    expect(updateGoodsReceiptStatusMock).toHaveBeenCalledWith("gr-1", "org-1", "RECEIVED", "CANCELLED", { cancellationReason: "yanlış kayıt" }, currentTx);
    expect(reverseGoodsReceiptStockMock).toHaveBeenCalled();
  });

  it("REJECTS cancellation once any item has been invoiced (DRAFT or CONFIRMED) — prevents erasing a physical fact a live invoice depends on", async () => {
    setupTx();
    findInvoicedQuantityRowsForPurchaseOrderItemMock.mockResolvedValue([{ quantity: 3 }]);

    await expect(cancelGoodsReceipt({ goodsReceiptId: "gr-1", organizationId: "org-1", reason: "yanlış kayıt" })).rejects.toThrow(/zaten faturalanmış/);

    expect(updateGoodsReceiptStatusMock).not.toHaveBeenCalled();
    expect(reverseGoodsReceiptStockMock).not.toHaveBeenCalled();
  });

  it("rejects cancelling an already-cancelled receipt", async () => {
    setupTx({ status: "CANCELLED" });
    await expect(cancelGoodsReceipt({ goodsReceiptId: "gr-1", organizationId: "org-1", reason: "test" })).rejects.toThrow(/already cancelled/);
  });
});
