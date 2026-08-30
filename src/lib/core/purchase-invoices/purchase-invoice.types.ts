import type { PurchaseInvoice, PurchaseInvoiceItem, PurchaseInvoiceStatus } from "@prisma/client";

export type { PurchaseInvoiceStatus };

export type PurchaseInvoiceResult = PurchaseInvoice & { items?: PurchaseInvoiceItem[] };

export type PurchaseInvoiceItemInput = {
  purchaseOrderItemId: string;
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

export type CreatePurchaseInvoiceFromPurchaseOrderInput = {
  organizationId: string;
  sourcePurchaseOrderId: string;
  sourceGoodsReceiptId?: string;
  supplierInvoiceNumber: string;
  items?: { purchaseOrderItemId: string; quantity: number }[];
  dueDate?: Date;
  notes?: string;
  idempotencyKey?: string;
};

export type CreatePurchaseInvoiceRepositoryInput = {
  organizationId: string;
  supplierId: string;
  purchaseOrderId: string;
  sourceGoodsReceiptId: string | null;
  supplierInvoiceNumber: string;
  amount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  dueDate?: Date;
  notes?: string;
  idempotencyKey?: string | null;
  requestHash?: string | null;
};
