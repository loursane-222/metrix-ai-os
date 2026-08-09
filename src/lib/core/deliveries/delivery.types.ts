import type { DeliveryItemCondition, DeliveryStatus, Prisma } from "@prisma/client";

export type { DeliveryStatus };

export type DeliveryItemInput = {
  orderItemId: string;
  productServiceId?: string;
  name: string;
  unit?: string;
  quantity: number;
  conditionFlag?: DeliveryItemCondition;
  sortOrder?: number;
};

export type CreateDeliveryInput = {
  organizationId: string;
  sourceOrderId: string;
  customerId: string;
  warehouse?: string;
  dispatchPoint?: string;
  deliveryAddress?: string;
  carrier?: string;
  notes?: string;
  items: DeliveryItemInput[];
};

export type CreateDeliveryFromOrderInput = {
  organizationId: string;
  sourceOrderId: string;
  items?: { orderItemId: string; quantity: number }[];
  performedById?: string;
  autoDispatch?: boolean;
};

export type TransitionDeliveryStatusInput = {
  deliveryId: string;
  organizationId: string;
  toStatus: DeliveryStatus;
  reason?: string;
  performedById?: string;
  evidence?: Record<string, unknown>;
};

export type CancelDeliveryInput = {
  deliveryId: string;
  organizationId: string;
  reason: string;
  performedById?: string;
};

export type ListDeliveriesInput = {
  organizationId: string;
  status?: DeliveryStatus;
  sourceOrderId?: string;
  limit?: number;
};

export type DeliveryResult = Prisma.DeliveryGetPayload<{
  include: {
    customer: true;
    sourceOrder: true;
    items: { include: { orderItem: true; productService: true } };
    statusHistory: true;
    exceptions: true;
    customFieldValues: true;
  };
}>;
