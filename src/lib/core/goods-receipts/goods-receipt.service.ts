import { prisma } from "@/lib/core/shared/prisma";
import { ApiValidationError } from "@/lib/api/validation";
import type { Prisma } from "@prisma/client";
import {
  createGoodsReceipt,
  createGoodsReceiptItems,
  findReceivedQuantityRowsForPurchaseOrderItem,
  generateGoodsReceiptNumber,
  getGoodsReceiptById,
  listGoodsReceiptsForOrganization,
  updateGoodsReceiptStatus,
} from "./goods-receipt.repository";
import { receiveStock, reverseGoodsReceiptStock } from "@/lib/core/stock/stock.service";
import { RECEIVABLE_PURCHASE_ORDER_STATUSES } from "@/lib/core/purchase-orders/purchase-order.service";
import { findInvoicedQuantityRowsForPurchaseOrderItem } from "@/lib/core/purchase-invoices/purchase-invoice.repository";
import type { CancelGoodsReceiptInput, CreateGoodsReceiptFromPurchaseOrderInput, ListGoodsReceiptsInput } from "./goods-receipt.types";

function assert(value: string | undefined, field: string): void {
  if (!value?.trim()) throw new Error(`${field} is required.`);
}

export function listGoodsReceipts(input: ListGoodsReceiptsInput) {
  assert(input.organizationId, "organizationId");
  return listGoodsReceiptsForOrganization(input);
}

export function getGoodsReceiptByIdForOrganization(id: string, organizationId: string) {
  assert(id, "id");
  assert(organizationId, "organizationId");
  return getGoodsReceiptById(id, organizationId);
}

/**
 * Phase 9 canonical stock-entry authority. §Hard invariants: Goods Receipt
 * fiziksel stock girişinin CANONICAL authority'sidir (receiveStock, mevcut
 * stock.service.ts, reuse edilir — parallel bir stock-mutation yolu
 * yaratılmaz); cumulative received quantity ordered quantity'yi aşamaz
 * (aynı FOR UPDATE + ORDER BY id ceiling deseni, Phase 6/7/8 ile birebir
 * aynı); concurrency/retry duplicate receipt/stock increase üretemez (aynı
 * lock, aynı sebep).
 */
export async function createGoodsReceiptFromPurchaseOrder(input: CreateGoodsReceiptFromPurchaseOrderInput) {
  assert(input.organizationId, "organizationId");
  assert(input.sourcePurchaseOrderId, "sourcePurchaseOrderId");
  assert(input.warehouseId, "warehouseId");

  return prisma.$transaction(async (tx) => {
    const purchaseOrder = await tx.purchaseOrder.findFirst({
      where: { id: input.sourcePurchaseOrderId, organizationId: input.organizationId },
      include: { items: true },
    });
    if (!purchaseOrder) throw new ApiValidationError("PurchaseOrder not found.", 404);
    if (!RECEIVABLE_PURCHASE_ORDER_STATUSES.includes(purchaseOrder.status as typeof RECEIVABLE_PURCHASE_ORDER_STATUSES[number])) {
      throw new ApiValidationError(`PurchaseOrder in status ${purchaseOrder.status} cannot receive goods. Must be APPROVED or PARTIALLY_RECEIVED.`, 409);
    }

    const warehouse = await tx.warehouse.findFirst({ where: { id: input.warehouseId, organizationId: input.organizationId } });
    if (!warehouse) throw new ApiValidationError("Warehouse not found.", 404);

    const requestedItems = input.items ?? purchaseOrder.items.map((item) => ({ purchaseOrderItemId: item.id, quantity: Number(item.quantity) }));
    if (!requestedItems.length) throw new ApiValidationError("No items to receive.", 400);

    // Same FOR UPDATE + ORDER BY id pattern as Phase 6/7/8's ceiling guards:
    // locks every referenced PurchaseOrderItem row before reading
    // already-received sums, so two concurrent goods receipts for the same
    // PurchaseOrderItem cannot both read the same pre-race sum and both
    // pass the over-receipt check (TOCTOU), and cannot both trigger a
    // duplicate stock increase.
    const purchaseOrderItemIds = [...new Set(requestedItems.map((r) => r.purchaseOrderItemId))];
    await tx.$queryRaw`SELECT id FROM "PurchaseOrderItem" WHERE id = ANY(${purchaseOrderItemIds}) AND "organizationId" = ${input.organizationId} ORDER BY id FOR UPDATE`;

    const receiptItemInputs = await Promise.all(
      requestedItems.map(async (req) => {
        const orderItem = purchaseOrder.items.find((i) => i.id === req.purchaseOrderItemId);
        if (!orderItem) throw new ApiValidationError(`PurchaseOrderItem ${req.purchaseOrderItemId} does not belong to this PurchaseOrder.`, 400);

        const receivedRows = await findReceivedQuantityRowsForPurchaseOrderItem(req.purchaseOrderItemId, input.organizationId, tx);
        const alreadyReceived = receivedRows.reduce((sum, r) => sum + Number(r.quantity), 0);
        const orderedQty = Number(orderItem.quantity);
        if (alreadyReceived + req.quantity > orderedQty) {
          throw new ApiValidationError(
            `Teslim alınan miktar sipariş miktarını aşıyor: ${orderItem.name} (sipariş: ${orderedQty}, zaten teslim alınmış: ${alreadyReceived}, istenen: ${req.quantity}).`,
            409,
          );
        }

        return {
          purchaseOrderItemId: req.purchaseOrderItemId,
          productServiceId: orderItem.productServiceId ?? undefined,
          name: orderItem.name,
          unit: orderItem.unit ?? undefined,
          quantity: req.quantity,
          sortOrder: orderItem.sortOrder,
        };
      }),
    );

    const receiptNumber = await generateGoodsReceiptNumber(input.organizationId, tx);
    const goodsReceipt = await createGoodsReceipt(
      {
        organizationId: input.organizationId,
        receiptNumber,
        sourcePurchaseOrderId: input.sourcePurchaseOrderId,
        supplierId: purchaseOrder.supplierId,
        warehouseId: input.warehouseId,
        notes: input.notes,
        performedById: input.performedById,
      },
      tx,
    );
    await createGoodsReceiptItems(goodsReceipt.id, input.organizationId, receiptItemInputs, tx);

    // Purchase Order is a commercial commitment only — it never touches
    // stock. GoodsReceipt (this function) is the sole authority that does,
    // via the existing canonical receiveStock (stock.service.ts) — never a
    // parallel stock-mutation path.
    for (const item of receiptItemInputs) {
      if (!item.productServiceId) continue;
      await receiveStock(
        {
          organizationId: input.organizationId,
          productServiceId: item.productServiceId,
          warehouseId: input.warehouseId,
          quantity: item.quantity,
          supplierId: purchaseOrder.supplierId,
          performedById: input.performedById,
          provenanceOverride: { sourceType: "GOODS_RECEIPT", sourceId: goodsReceipt.id },
        },
        tx,
      );
    }

    await syncPurchaseOrderReceiptStatus(tx, input.organizationId, input.sourcePurchaseOrderId);

    return getGoodsReceiptById(goodsReceipt.id, input.organizationId, tx);
  });
}

/**
 * Bir CANCELLED olmayan GoodsReceipt'i canonical olarak iptal eder: stock'u
 * reverseGoodsReceiptStock ile (RETURN movement, orijinal RECEIPT movement'ı
 * asla silinmez/mutate edilmez) geri alır, PurchaseOrder durumunu (varsa
 * RECEIVED/PARTIALLY_RECEIVED'dan) yeniden senkronize eder.
 */
export async function cancelGoodsReceipt(input: CancelGoodsReceiptInput) {
  assert(input.goodsReceiptId, "goodsReceiptId");
  assert(input.organizationId, "organizationId");
  assert(input.reason, "reason");

  return prisma.$transaction(async (tx) => {
    const goodsReceipt = await tx.goodsReceipt.findFirst({ where: { id: input.goodsReceiptId, organizationId: input.organizationId }, include: { items: true } });
    if (!goodsReceipt) throw new ApiValidationError("GoodsReceipt not found.", 404);
    if (goodsReceipt.status === "CANCELLED") throw new ApiValidationError("GoodsReceipt is already cancelled.", 409);

    // Once any of this receipt's items have been invoiced (DRAFT or
    // CONFIRMED — anything not CANCELLED), a real commercial claim already
    // exists against the received quantity. Reversing the physical stock
    // here without also reversing that claim would silently erase a fact
    // (received goods) a live PurchaseInvoice still depends on — mirrors
    // Delivery's structural DISPATCHED-can't-CANCEL restriction on the
    // sales side (§Phase 6), applied here as an explicit guard instead of a
    // status-graph restriction because GoodsReceipt has no pre-consumption
    // staging state to exploit for the same effect.
    for (const item of goodsReceipt.items) {
      const invoicedRows = await findInvoicedQuantityRowsForPurchaseOrderItem(item.purchaseOrderItemId, input.organizationId, tx);
      const totalInvoiced = invoicedRows.reduce((sum, r) => sum + Number(r.quantity), 0);
      if (totalInvoiced > 0) {
        throw new ApiValidationError(
          `Bu mal kabul zaten faturalanmış kalemler içeriyor (${item.name}); iptal edilemez.`,
          409,
        );
      }
    }

    const result = await updateGoodsReceiptStatus(input.goodsReceiptId, input.organizationId, "RECEIVED", "CANCELLED", { cancellationReason: input.reason }, tx);
    if (!result.count) throw new ApiValidationError("GoodsReceipt was concurrently modified; reload and retry.", 409);

    await reverseGoodsReceiptStock(
      input.goodsReceiptId,
      input.organizationId,
      goodsReceipt.items.map((item) => ({ productServiceId: item.productServiceId, quantity: Number(item.quantity) })),
      goodsReceipt.warehouseId,
      tx,
    );
    await syncPurchaseOrderReceiptStatus(tx, input.organizationId, goodsReceipt.sourcePurchaseOrderId);

    return getGoodsReceiptById(input.goodsReceiptId, input.organizationId, tx);
  });
}

/**
 * delivery.service.ts::syncOrderShipmentStatus'un Purchase Order karşılığı —
 * gerçek (non-CANCELLED) GoodsReceipt'lerdeki toplam alınan miktarı her
 * PurchaseOrderItem için yeniden toplar ve PurchaseOrder durumunu buna göre
 * ayarlar. Bilerek transitionPurchaseOrderStatus'un ALLOWED_TRANSITIONS
 * grafiğini VE CAS'ını atlar — bu bir kullanıcı kararı değil, var olan
 * fiziksel gerçeğin (ne kadarı teslim alındı) yeniden hesaplanmasıdır; bir
 * receipt iptal edildiğinde RECEIVED/PARTIALLY_RECEIVED'dan APPROVED'a
 * simetrik olarak geri düşebilmelidir (syncInvoiceStatusForPayment'ın
 * PAID→SENT geri dönüşüyle aynı ilke). CANCELLED bir PO asla canlandırılmaz.
 */
async function syncPurchaseOrderReceiptStatus(tx: Prisma.TransactionClient, organizationId: string, purchaseOrderId: string): Promise<void> {
  const purchaseOrder = await tx.purchaseOrder.findFirst({ where: { id: purchaseOrderId, organizationId }, include: { items: true } });
  if (!purchaseOrder || purchaseOrder.status === "CANCELLED" || purchaseOrder.status === "DRAFT") return;

  let totalOrdered = 0;
  let totalReceived = 0;
  for (const item of purchaseOrder.items) {
    totalOrdered += Number(item.quantity);
    const rows = await findReceivedQuantityRowsForPurchaseOrderItem(item.id, organizationId, tx);
    totalReceived += rows.reduce((sum, r) => sum + Number(r.quantity), 0);
  }

  const EPSILON = 0.0005;
  const newStatus = totalReceived <= EPSILON ? "APPROVED" : totalReceived >= totalOrdered - EPSILON ? "RECEIVED" : "PARTIALLY_RECEIVED";
  if (newStatus !== purchaseOrder.status) {
    await tx.purchaseOrder.updateMany({ where: { id: purchaseOrderId, organizationId }, data: { status: newStatus } });
  }
}
