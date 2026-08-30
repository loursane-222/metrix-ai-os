import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  createGoodsReceiptMock, createGoodsReceiptItemsMock, generateGoodsReceiptNumberMock, receiveStockMock,
} = vi.hoisted(() => ({
  createGoodsReceiptMock: vi.fn(),
  createGoodsReceiptItemsMock: vi.fn(),
  generateGoodsReceiptNumberMock: vi.fn().mockResolvedValue("GR-0001"),
  receiveStockMock: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(currentTx)) },
}));

vi.mock("../goods-receipt.repository", async () => {
  const actual = await vi.importActual<typeof import("../goods-receipt.repository")>("../goods-receipt.repository");
  return {
    ...actual,
    createGoodsReceipt: createGoodsReceiptMock,
    createGoodsReceiptItems: createGoodsReceiptItemsMock,
    generateGoodsReceiptNumber: generateGoodsReceiptNumberMock,
  };
});

vi.mock("@/lib/core/stock/stock.service", () => ({ receiveStock: receiveStockMock, reverseGoodsReceiptStock: vi.fn() }));

import { createGoodsReceiptFromPurchaseOrder } from "../goods-receipt.service";

const purchaseOrder = {
  id: "po-1",
  organizationId: "org-1",
  status: "APPROVED",
  supplierId: "supplier-1",
  currency: "TRY",
  items: [{ id: "poi-1", productServiceId: "prod-1", name: "Item 1", unit: "adet", quantity: 10, sortOrder: 0 }],
};

let currentTx: {
  purchaseOrder: { findFirst: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
  warehouse: { findFirst: ReturnType<typeof vi.fn> };
  goodsReceipt: { findFirst: ReturnType<typeof vi.fn> };
  goodsReceiptItem: { findMany: ReturnType<typeof vi.fn> };
  $queryRaw: ReturnType<typeof vi.fn>;
};

function setupTx(alreadyReceived: Record<string, number> = {}, poOverrides: Partial<typeof purchaseOrder> = {}) {
  currentTx = {
    purchaseOrder: { findFirst: vi.fn().mockResolvedValue({ ...purchaseOrder, ...poOverrides }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    warehouse: { findFirst: vi.fn().mockResolvedValue({ id: "wh-1", organizationId: "org-1" }) },
    goodsReceipt: { findFirst: vi.fn().mockResolvedValue({ id: "gr-1" }) },
    goodsReceiptItem: {
      findMany: vi.fn(({ where }: { where: { purchaseOrderItemId?: string } }) => {
        const already = alreadyReceived[where.purchaseOrderItemId ?? ""] ?? 0;
        return Promise.resolve(already > 0 ? [{ quantity: already }] : []);
      }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  return currentTx;
}

describe("createGoodsReceiptFromPurchaseOrder — Phase 9 over-receipt ceiling", () => {
  beforeEach(() => {
    createGoodsReceiptMock.mockReset().mockResolvedValue({ id: "gr-1" });
    createGoodsReceiptItemsMock.mockReset();
    receiveStockMock.mockReset();
    generateGoodsReceiptNumberMock.mockReset().mockResolvedValue("GR-0001");
  });

  it("rejects goods receipt against a DRAFT purchase order", async () => {
    setupTx({}, { status: "DRAFT" });
    await expect(createGoodsReceiptFromPurchaseOrder({ organizationId: "org-1", sourcePurchaseOrderId: "po-1", warehouseId: "wh-1" })).rejects.toThrow(/cannot receive goods/);
  });

  it("rejects receiving more than was ordered (over-receipt)", async () => {
    setupTx({ "poi-1": 8 });
    await expect(
      createGoodsReceiptFromPurchaseOrder({ organizationId: "org-1", sourcePurchaseOrderId: "po-1", warehouseId: "wh-1", items: [{ purchaseOrderItemId: "poi-1", quantity: 4 }] }),
    ).rejects.toThrow(/Teslim alınan miktar sipariş miktarını aşıyor/);
    expect(receiveStockMock).not.toHaveBeenCalled();
  });

  it("acquires the FOR UPDATE lock on PurchaseOrderItem rows before reading received sums", async () => {
    const tx = setupTx();
    await createGoodsReceiptFromPurchaseOrder({ organizationId: "org-1", sourcePurchaseOrderId: "po-1", warehouseId: "wh-1" });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0]!;
    const sumOrder = tx.goodsReceiptItem.findMany.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(sumOrder);
  });

  it("reuses the canonical receiveStock authority with GOODS_RECEIPT provenance — never a parallel stock write", async () => {
    setupTx();
    await createGoodsReceiptFromPurchaseOrder({ organizationId: "org-1", sourcePurchaseOrderId: "po-1", warehouseId: "wh-1", items: [{ purchaseOrderItemId: "poi-1", quantity: 6 }] });

    expect(receiveStockMock).toHaveBeenCalledWith(
      expect.objectContaining({ productServiceId: "prod-1", warehouseId: "wh-1", quantity: 6, provenanceOverride: { sourceType: "GOODS_RECEIPT", sourceId: "gr-1" } }),
      currentTx,
    );
  });

  it("syncs PurchaseOrder to PARTIALLY_RECEIVED when only part of the order is received", async () => {
    const tx = setupTx({ "poi-1": 4 }); // findMany always reports 4 received, regardless of when it's called
    await createGoodsReceiptFromPurchaseOrder({ organizationId: "org-1", sourcePurchaseOrderId: "po-1", warehouseId: "wh-1", items: [{ purchaseOrderItemId: "poi-1", quantity: 0 }] });

    expect(tx.purchaseOrder.updateMany).toHaveBeenCalledWith({ where: { id: "po-1", organizationId: "org-1" }, data: { status: "PARTIALLY_RECEIVED" } });
  });

  it("syncs PurchaseOrder to RECEIVED once the full ordered quantity is received", async () => {
    const tx = setupTx({ "poi-1": 10 });
    await createGoodsReceiptFromPurchaseOrder({ organizationId: "org-1", sourcePurchaseOrderId: "po-1", warehouseId: "wh-1", items: [{ purchaseOrderItemId: "poi-1", quantity: 0 }] });

    expect(tx.purchaseOrder.updateMany).toHaveBeenCalledWith({ where: { id: "po-1", organizationId: "org-1" }, data: { status: "RECEIVED" } });
  });
});
