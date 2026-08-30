import { prisma } from "@/lib/core/shared/prisma";
import type { GoodsReceiptStatus, Prisma } from "@prisma/client";
import type { ListGoodsReceiptsInput } from "./goods-receipt.types";

const include = {
  supplier: true,
  sourcePurchaseOrder: true,
  items: { include: { productService: true, purchaseOrderItem: true }, orderBy: { sortOrder: "asc" as const } },
} as const;

export function getGoodsReceiptById(id: string, organizationId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.goodsReceipt.findFirst({ where: { id, organizationId }, include });
}

export function listGoodsReceiptsForOrganization(input: ListGoodsReceiptsInput) {
  return prisma.goodsReceipt.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.sourcePurchaseOrderId ? { sourcePurchaseOrderId: input.sourcePurchaseOrderId } : {}),
    },
    include,
    orderBy: { createdAt: "desc" },
    take: Math.min(input.limit ?? 100, 500),
  });
}

export async function generateGoodsReceiptNumber(organizationId: string, tx: Prisma.TransactionClient = prisma): Promise<string> {
  const count = await tx.goodsReceipt.count({ where: { organizationId } });
  return `GR-${String(count + 1).padStart(4, "0")}`;
}

export function createGoodsReceipt(
  input: { organizationId: string; receiptNumber: string; sourcePurchaseOrderId: string; supplierId: string; warehouseId: string; notes?: string; performedById?: string },
  tx: Prisma.TransactionClient = prisma,
) {
  return tx.goodsReceipt.create({
    data: {
      organizationId: input.organizationId,
      receiptNumber: input.receiptNumber,
      sourcePurchaseOrderId: input.sourcePurchaseOrderId,
      supplierId: input.supplierId,
      warehouseId: input.warehouseId,
      notes: input.notes,
      performedById: input.performedById,
      status: "RECEIVED",
    },
  });
}

export function createGoodsReceiptItems(
  goodsReceiptId: string,
  organizationId: string,
  items: { purchaseOrderItemId: string; productServiceId?: string; name: string; unit?: string; quantity: number; sortOrder?: number }[],
  tx: Prisma.TransactionClient = prisma,
) {
  return tx.goodsReceiptItem.createMany({
    data: items.map((item, index) => ({
      organizationId,
      goodsReceiptId,
      purchaseOrderItemId: item.purchaseOrderItemId,
      productServiceId: item.productServiceId,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
      sortOrder: item.sortOrder ?? index,
    })),
  });
}

/**
 * Bir PurchaseOrderItem'a karşı bugüne kadar (CANCELLED olmayan herhangi bir
 * GoodsReceipt'te) fiilen teslim alınmış toplam miktarı hesaplamak için ham
 * satırlar — createGoodsReceiptFromPurchaseOrder'ın over-receipt ceiling'i
 * bunu kullanır: remaining = ordered - alreadyReceived.
 */
export function findReceivedQuantityRowsForPurchaseOrderItem(
  purchaseOrderItemId: string,
  organizationId: string,
  tx: Prisma.TransactionClient = prisma,
) {
  return tx.goodsReceiptItem.findMany({
    where: { purchaseOrderItemId, organizationId, goodsReceipt: { status: { not: "CANCELLED" } } },
    select: { quantity: true },
  });
}

export async function updateGoodsReceiptStatus(
  id: string,
  organizationId: string,
  fromStatus: GoodsReceiptStatus,
  toStatus: GoodsReceiptStatus,
  extra: { cancellationReason?: string } = {},
  tx: Prisma.TransactionClient = prisma,
) {
  return tx.goodsReceipt.updateMany({ where: { id, organizationId, status: fromStatus }, data: { status: toStatus, ...extra } });
}
