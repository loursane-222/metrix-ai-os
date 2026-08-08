import type { OrderStatus, Prisma } from "@prisma/client";

export type { OrderStatus };

export type OrderItemInput = {
  productServiceId?: string;
  name: string;
  unit?: string;
  quantity: number;
  unitPriceCents: bigint;
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

export type OrderResult = Prisma.OrderGetPayload<{
  include: {
    customer: true;
    sourceQuote: true;
    items: { include: { productService: true } };
    statusHistory: true;
    customFieldValues: true;
  };
}>;
