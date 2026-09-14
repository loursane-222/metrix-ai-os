import {
  db
} from "../db";

import {
  requireOrganizationAccess
} from "../auth/organization-access";

export type OrderItemReality = {
  id: string;
  productServiceId: string | null;
  name: string;
  unit: string | null;
  quantity: number;
  unitPriceCents: string;
  discountBasisPoints: number;
  vatRateBasisPoints: number;
  lineTotalCents: string;
  sortOrder: number;
};

export type OrderReality = {
  id: string;
  orderNumber: string;
  sourceQuoteId: string;
  customerId: string;
  customerName: string;
  title: string;
  amount: number | null;
  currency: string;
  status: "DRAFT";
  generalDiscountBasisPoints: number | null;
  deliveryTerm: string | null;
  deliveryMethod: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemReality[];
};

const MAX_RESULTS = 20;

const orderSelect = {
  id: true,
  orderNumber: true,
  sourceQuoteId: true,
  customerId: true,
  customerName: true,
  title: true,
  amount: true,
  currency: true,
  status: true,
  generalDiscountBasisPoints: true,
  deliveryTerm: true,
  deliveryMethod: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  items: {
    orderBy: {
      sortOrder: "asc" as const
    },
    select: {
      id: true,
      productServiceId: true,
      name: true,
      unit: true,
      quantity: true,
      unitPriceCents: true,
      discountBasisPoints: true,
      vatRateBasisPoints: true,
      lineTotalCents: true,
      sortOrder: true
    }
  }
};

type RawOrderWithItems = {
  id: string;
  orderNumber: string;
  sourceQuoteId: string;
  customerId: string;
  customerName: string;
  title: string;
  amount: unknown;
  currency: string;
  status: "DRAFT";
  generalDiscountBasisPoints: number | null;
  deliveryTerm: string | null;
  deliveryMethod: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    productServiceId: string | null;
    name: string;
    unit: string | null;
    quantity: unknown;
    unitPriceCents: bigint;
    discountBasisPoints: number;
    vatRateBasisPoints: number;
    lineTotalCents: bigint;
    sortOrder: number;
  }>;
};

function toReality(
  order: RawOrderWithItems
): OrderReality {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    sourceQuoteId: order.sourceQuoteId,
    customerId: order.customerId,
    customerName: order.customerName,
    title: order.title,
    amount:
      order.amount === null
        ? null
        : Number(order.amount),
    currency: order.currency,
    status: order.status,
    generalDiscountBasisPoints:
      order.generalDiscountBasisPoints,
    deliveryTerm: order.deliveryTerm,
    deliveryMethod: order.deliveryMethod,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items: order.items.map(item => ({
      id: item.id,
      productServiceId: item.productServiceId,
      name: item.name,
      unit: item.unit,
      quantity: Number(item.quantity),
      unitPriceCents:
        item.unitPriceCents.toString(),
      discountBasisPoints:
        item.discountBasisPoints,
      vatRateBasisPoints:
        item.vatRateBasisPoints,
      lineTotalCents:
        item.lineTotalCents.toString(),
      sortOrder: item.sortOrder
    }))
  };
}

export async function listOrdersForOrganization(
  input: {
    actorUserId: string;
    organizationId: string;
    orderId?: string;
    query?: string;
    customerId?: string;
    status?: "DRAFT";
  }
): Promise<OrderReality[]> {
  const actorUserId =
    input.actorUserId.trim();

  const organizationId =
    input.organizationId.trim();

  await requireOrganizationAccess({
    userId: actorUserId,
    organizationId
  });

  const orderId = input.orderId?.trim();
  const customerId = input.customerId?.trim();
  const query = input.query?.trim();

  const orders = await db.order.findMany({
    where: {
      organizationId,
      ...(orderId ? { id: orderId } : {}),
      ...(customerId
        ? { customerId }
        : {}),
      ...(input.status
        ? { status: input.status }
        : {}),
      ...(query
        ? {
            OR: [
              {
                title: {
                  contains: query,
                  mode: "insensitive" as const
                }
              },
              {
                customerName: {
                  contains: query,
                  mode: "insensitive" as const
                }
              },
              {
                orderNumber: {
                  contains: query,
                  mode: "insensitive" as const
                }
              }
            ]
          }
        : {})
    },
    select: orderSelect,
    orderBy: [
      { updatedAt: "desc" },
      { id: "asc" }
    ],
    take: MAX_RESULTS
  });

  return orders.map(toReality);
}
