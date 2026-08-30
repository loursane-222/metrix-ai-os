import type { GoodsReceiptStatus, Prisma } from "@prisma/client";

export type { GoodsReceiptStatus };

export type CreateGoodsReceiptFromPurchaseOrderInput = {
  organizationId: string;
  sourcePurchaseOrderId: string;
  warehouseId: string;
  items?: { purchaseOrderItemId: string; quantity: number }[];
  notes?: string;
  performedById?: string;
};

export type CancelGoodsReceiptInput = {
  goodsReceiptId: string;
  organizationId: string;
  reason: string;
  performedById?: string;
};

export type ListGoodsReceiptsInput = {
  organizationId: string;
  status?: GoodsReceiptStatus;
  sourcePurchaseOrderId?: string;
  limit?: number;
};

export type GoodsReceiptResult = Prisma.GoodsReceiptGetPayload<{
  include: { supplier: true; sourcePurchaseOrder: true; items: { include: { productService: true; purchaseOrderItem: true } } };
}>;
