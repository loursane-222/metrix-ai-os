import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  createPurchaseInvoiceMock, createPurchaseInvoiceItemsMock, countPurchaseInvoicesForOrganizationMock,
  findInvoicedQuantityRowsForPurchaseOrderItemMock, findReceivedQuantityRowsForPurchaseOrderItemMock,
} = vi.hoisted(() => ({
  createPurchaseInvoiceMock: vi.fn(),
  createPurchaseInvoiceItemsMock: vi.fn(),
  countPurchaseInvoicesForOrganizationMock: vi.fn().mockResolvedValue(0),
  findInvoicedQuantityRowsForPurchaseOrderItemMock: vi.fn().mockResolvedValue([]),
  findReceivedQuantityRowsForPurchaseOrderItemMock: vi.fn().mockResolvedValue([{ quantity: 10 }]),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(currentTx)) },
}));

vi.mock("../purchase-invoice.repository", async () => {
  const actual = await vi.importActual<typeof import("../purchase-invoice.repository")>("../purchase-invoice.repository");
  return {
    ...actual,
    createPurchaseInvoice: createPurchaseInvoiceMock,
    createPurchaseInvoiceItems: createPurchaseInvoiceItemsMock,
    countPurchaseInvoicesForOrganization: countPurchaseInvoicesForOrganizationMock,
    findInvoicedQuantityRowsForPurchaseOrderItem: findInvoicedQuantityRowsForPurchaseOrderItemMock,
  };
});

vi.mock("@/lib/core/goods-receipts/goods-receipt.repository", () => ({ findReceivedQuantityRowsForPurchaseOrderItem: findReceivedQuantityRowsForPurchaseOrderItemMock }));

import { createPurchaseInvoiceFromPurchaseOrder } from "../purchase-invoice.service";

const purchaseOrder = {
  id: "po-1",
  organizationId: "org-1",
  supplierId: "supplier-1",
  currency: "TRY",
  items: [
    { id: "poi-1", productServiceId: "prod-1", name: "Item 1", unit: "adet", quantity: 10, unitPriceCents: BigInt(1000), discountBasisPoints: 0, vatRateBasisPoints: 2000, sortOrder: 0 },
  ],
};

let currentTx: { purchaseOrder: { findFirst: ReturnType<typeof vi.fn> } } & { goodsReceipt: { findFirst: ReturnType<typeof vi.fn> } } & { $queryRaw: ReturnType<typeof vi.fn> };

function setupTx() {
  currentTx = {
    purchaseOrder: { findFirst: vi.fn().mockResolvedValue(purchaseOrder) },
    goodsReceipt: { findFirst: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  return currentTx;
}

describe("createPurchaseInvoiceFromPurchaseOrder — Phase 9 over-invoicing ceiling", () => {
  beforeEach(() => {
    createPurchaseInvoiceMock.mockReset().mockImplementation((data: Record<string, unknown>) => Promise.resolve({ id: "pi-1", ...data }));
    createPurchaseInvoiceItemsMock.mockReset();
    countPurchaseInvoicesForOrganizationMock.mockReset().mockResolvedValue(0);
    findInvoicedQuantityRowsForPurchaseOrderItemMock.mockReset().mockResolvedValue([]);
    findReceivedQuantityRowsForPurchaseOrderItemMock.mockReset().mockResolvedValue([{ quantity: 10 }]);
  });

  it("computes amount/taxAmount/totalAmount deterministically from PurchaseOrderItem lines", async () => {
    setupTx();
    const result = await createPurchaseInvoiceFromPurchaseOrder({ organizationId: "org-1", sourcePurchaseOrderId: "po-1", supplierInvoiceNumber: "SUP-INV-1" });

    // 10 units * 10.00 = 100.00 net, 20% VAT = 20.00, total 120.00
    expect(result.amount).toBeCloseTo(100);
    expect(result.taxAmount).toBeCloseTo(20);
    expect(result.totalAmount).toBeCloseTo(120);
  });

  it("rejects invoicing more than has been received (over-invoicing ceiling)", async () => {
    setupTx();
    findReceivedQuantityRowsForPurchaseOrderItemMock.mockResolvedValue([{ quantity: 4 }]);

    await expect(
      createPurchaseInvoiceFromPurchaseOrder({ organizationId: "org-1", sourcePurchaseOrderId: "po-1", supplierInvoiceNumber: "SUP-INV-1", items: [{ purchaseOrderItemId: "poi-1", quantity: 10 }] }),
    ).rejects.toThrow(/Faturalanan miktar teslim alınan miktarı aşıyor/);
    expect(createPurchaseInvoiceMock).not.toHaveBeenCalled();
  });

  it("accounts for already-invoiced quantity across multiple purchase invoices", async () => {
    setupTx();
    findReceivedQuantityRowsForPurchaseOrderItemMock.mockResolvedValue([{ quantity: 10 }]);
    findInvoicedQuantityRowsForPurchaseOrderItemMock.mockResolvedValue([{ quantity: 6 }]);

    await createPurchaseInvoiceFromPurchaseOrder({ organizationId: "org-1", sourcePurchaseOrderId: "po-1", supplierInvoiceNumber: "SUP-INV-1", items: [{ purchaseOrderItemId: "poi-1", quantity: 4 }] });
    expect(createPurchaseInvoiceMock).toHaveBeenCalledTimes(1);

    createPurchaseInvoiceMock.mockClear();
    findInvoicedQuantityRowsForPurchaseOrderItemMock.mockResolvedValue([{ quantity: 10 }]);
    await expect(
      createPurchaseInvoiceFromPurchaseOrder({ organizationId: "org-1", sourcePurchaseOrderId: "po-1", supplierInvoiceNumber: "SUP-INV-2", items: [{ purchaseOrderItemId: "poi-1", quantity: 1 }] }),
    ).rejects.toThrow(/Faturalanan miktar teslim alınan miktarı aşıyor/);
  });

  it("acquires the FOR UPDATE lock on PurchaseOrderItem rows before reading received/invoiced sums", async () => {
    const tx = setupTx();
    await createPurchaseInvoiceFromPurchaseOrder({ organizationId: "org-1", sourcePurchaseOrderId: "po-1", supplierInvoiceNumber: "SUP-INV-1" });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0]!;
    const receivedReadOrder = findReceivedQuantityRowsForPurchaseOrderItemMock.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(receivedReadOrder);
  });

  it("never touches Stock — purchase invoicing is not a stock movement authority", async () => {
    const tx = setupTx();
    await createPurchaseInvoiceFromPurchaseOrder({ organizationId: "org-1", sourcePurchaseOrderId: "po-1", supplierInvoiceNumber: "SUP-INV-1" });
    expect((tx as unknown as { stock?: unknown }).stock).toBeUndefined();
  });

  it("carries PurchaseOrder provenance and never re-reads Supplier commercial terms independently", async () => {
    setupTx();
    const result = await createPurchaseInvoiceFromPurchaseOrder({ organizationId: "org-1", sourcePurchaseOrderId: "po-1", supplierInvoiceNumber: "SUP-INV-1" });
    expect(createPurchaseInvoiceMock).toHaveBeenCalledWith(expect.objectContaining({ purchaseOrderId: "po-1", supplierId: "supplier-1" }), currentTx);
    expect(result.supplierId).toBe("supplier-1");
  });
});
