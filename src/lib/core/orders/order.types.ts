import type { OrderExceptionCategory, OrderRevisionChangeType, OrderStatus, Prisma } from "@prisma/client";
import type { StructuredPaymentTerm } from "@/lib/payment-terms";

export type { OrderStatus };

export type OrderItemInput = {
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

export type CreateOrderInput = {
  organizationId: string;
  customerId: string;
  currency?: string;
  notes?: string;
  priority?: number;
  deadlineAt?: Date;
  commitmentAt?: Date;
  items?: OrderItemInput[];
  createdByUserId?: string;
  paymentTermSnapshot?: StructuredPaymentTerm;
  paymentTermReferenceDatesSnapshot?: { QUOTE_DATE?: string; ORDER_DATE?: string };
};

export type CreateOrderFromQuoteInput = {
  organizationId: string;
  quoteId: string;
  performedById?: string;
};

export type TransitionOrderStatusInput = {
  orderId: string;
  organizationId: string;
  toStatus: OrderStatus;
  reason?: string;
  performedById?: string;
  evidence?: Record<string, unknown>;
};

export type CancelOrderInput = {
  orderId: string;
  organizationId: string;
  reason: string;
  performedById?: string;
};

export type ListOrdersInput = {
  organizationId: string;
  status?: OrderStatus;
  customerId?: string;
  limit?: number;
};

export type OrderRevisionChange =
  | { changeType: "QUANTITY_CHANGED"; orderItemId: string; quantity: number }
  | { changeType: "DEADLINE_CHANGED"; deadlineAt: Date | null }
  | { changeType: "ITEM_ADDED"; item: OrderItemInput }
  | { changeType: "ITEM_REMOVED"; orderItemId: string };

export type RecordOrderExceptionInput = {
  orderId: string;
  organizationId: string;
  category: OrderExceptionCategory;
  note?: string;
  performedById?: string;
};

export type { OrderExceptionCategory, OrderRevisionChangeType };

export type OrderResult = Prisma.OrderGetPayload<{
  include: {
    customer: true;
    sourceQuote: true;
    items: { include: { productService: true } };
    statusHistory: true;
    revisions: true;
    exceptions: true;
    customFieldValues: true;
  };
}>;
