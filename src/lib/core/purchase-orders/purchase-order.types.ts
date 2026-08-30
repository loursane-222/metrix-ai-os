import type { Prisma, PurchaseOrderStatus } from "@prisma/client";

export type { PurchaseOrderStatus };

export type PurchaseOrderItemInput = {
  productServiceId?: string;
  name: string;
  unit?: string;
  quantity: number;
  unitPriceCents: bigint;
  discountBasisPoints?: number;
  vatRateBasisPoints?: number;
  lineTotalCents: bigint;
  sortOrder?: number;
};

export type CreatePurchaseOrderInput = {
  organizationId: string;
  supplierId: string;
  currency?: string;
  notes?: string;
  expectedDeliveryDate?: Date;
  items?: PurchaseOrderItemInput[];
  createdByUserId?: string;
};

export type TransitionPurchaseOrderStatusInput = {
  purchaseOrderId: string;
  organizationId: string;
  toStatus: PurchaseOrderStatus;
  reason?: string;
  performedById?: string;
};

export type CancelPurchaseOrderInput = {
  purchaseOrderId: string;
  organizationId: string;
  reason: string;
  performedById?: string;
};

export type ListPurchaseOrdersInput = {
  organizationId: string;
  status?: PurchaseOrderStatus;
  supplierId?: string;
  limit?: number;
};

export type PurchaseOrderResult = Prisma.PurchaseOrderGetPayload<{
  include: { supplier: true; items: { include: { productService: true } } };
}>;
