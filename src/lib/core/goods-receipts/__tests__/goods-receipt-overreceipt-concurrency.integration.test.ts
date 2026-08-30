import { describe, expect, it } from "vitest";

const databaseUrl = process.env.GOODS_RECEIPT_CONCURRENCY_INTEGRATION_DATABASE_URL;

/**
 * Bkz. delivery-overshipping-concurrency.integration.test.ts (Phase 6) —
 * aynı gerçek-Postgres, env-var-gated desen. Mocked unit testlerin
 * (goods-receipt-ceiling.service.test.ts) KANITLAYAMADIĞI şeyi kanıtlar:
 * gerçek eşzamanlı transaction'lar altında Postgres'in row-level
 * SELECT...FOR UPDATE kilidinin, aynı PurchaseOrderItem'a karşı iki gerçek
 * eşzamanlı createGoodsReceiptFromPurchaseOrder çağrısının ikisinin de
 * over-receipt ceiling'ini aşmasını gerçekten engellediğini doğrular.
 * Varsayılan test koşusunda (env var set değilken) skip edilir.
 */
describe.skipIf(!databaseUrl)("GoodsReceipt over-receipt concurrency against migrated PostgreSQL", () => {
  it("OVER-RECEIPT CEILING: two truly concurrent goods receipts that would together exceed a PurchaseOrderItem's ordered quantity never both fully receive", async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [{ prisma }, { createGoodsReceiptFromPurchaseOrder }] = await Promise.all([
      import("@/lib/core/shared/prisma"),
      import("@/lib/core/goods-receipts/goods-receipt.service"),
    ]);

    const organization = await prisma.organization.create({ data: { name: `GoodsReceipt concurrency ceiling ${Date.now()}` } });
    const supplier = await prisma.supplier.create({ data: { organizationId: organization.id, displayName: "Concurrency Test Supplier" } });
    const product = await prisma.productService.create({ data: { organizationId: organization.id, name: "Concurrency Test Product", type: "PRODUCT" } });
    const warehouse = await prisma.warehouse.create({ data: { organizationId: organization.id, name: "Ana Depo", code: `WH-${Date.now()}` } });
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: { organizationId: organization.id, poNumber: `PO-CONC-${Date.now()}`, supplierId: supplier.id, status: "APPROVED", currency: "TRY" },
    });
    const purchaseOrderItem = await prisma.purchaseOrderItem.create({
      data: { organizationId: organization.id, purchaseOrderId: purchaseOrder.id, productServiceId: product.id, name: "Line 1", quantity: 10, unitPriceCents: BigInt(100), lineTotalCents: BigInt(1000) },
    });

    try {
      const attempt = () =>
        createGoodsReceiptFromPurchaseOrder({ organizationId: organization.id, sourcePurchaseOrderId: purchaseOrder.id, warehouseId: warehouse.id, items: [{ purchaseOrderItemId: purchaseOrderItem.id, quantity: 6 }] });

      const results = await Promise.allSettled([attempt(), attempt()]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const receivedItems = await prisma.goodsReceiptItem.findMany({
        where: { purchaseOrderItemId: purchaseOrderItem.id, organizationId: organization.id, goodsReceipt: { status: { not: "CANCELLED" } } },
      });
      const totalReceived = receivedItems.reduce((sum, item) => sum + Number(item.quantity), 0);
      expect(totalReceived).toBeLessThanOrEqual(10);
      expect(totalReceived).toBe(6); // exactly one 6-unit receipt ever committed, never 12

      const stock = await prisma.stock.findFirst({ where: { organizationId: organization.id, productServiceId: product.id, warehouseId: warehouse.id } });
      expect(Number(stock?.quantity ?? 0)).toBe(6); // stock increased exactly once, never double-counted
    } finally {
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.$disconnect();
    }
  });
});
