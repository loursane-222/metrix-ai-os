import {
  db
} from "../db";

import {
  requireOrganizationAccess
} from "../auth/organization-access";

export type InvoiceItemReality = {
  id: string;
  orderItemId: string;
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

export type InvoiceReality = {
  id: string;
  invoiceNumber: string;
  sourceOrderId: string;
  customerId: string;
  title: string;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  status: "DRAFT";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: InvoiceItemReality[];
};

const MAX_RESULTS = 20;

const invoiceSelect = {
  id: true,
  invoiceNumber: true,
  sourceOrderId: true,
  customerId: true,
  title: true,
  amount: true,
  taxAmount: true,
  totalAmount: true,
  currency: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  items: {
    orderBy: {
      sortOrder: "asc" as const
    },
    select: {
      id: true,
      orderItemId: true,
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

type RawInvoiceWithItems = {
  id: string;
  invoiceNumber: string;
  sourceOrderId: string;
  customerId: string;
  title: string;
  amount: unknown;
  taxAmount: unknown;
  totalAmount: unknown;
  currency: string;
  status: "DRAFT";
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    orderItemId: string;
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
  invoice: RawInvoiceWithItems
): InvoiceReality {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    sourceOrderId: invoice.sourceOrderId,
    customerId: invoice.customerId,
    title: invoice.title,
    amount: Number(invoice.amount),
    taxAmount: Number(invoice.taxAmount),
    totalAmount: Number(invoice.totalAmount),
    currency: invoice.currency,
    status: invoice.status,
    notes: invoice.notes,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    items: invoice.items.map(item => ({
      id: item.id,
      orderItemId: item.orderItemId,
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

export async function listInvoicesForOrganization(
  input: {
    actorUserId: string;
    organizationId: string;
    invoiceId?: string;
    query?: string;
    customerId?: string;
    orderId?: string;
    status?: "DRAFT";
  }
): Promise<InvoiceReality[]> {
  const actorUserId =
    input.actorUserId.trim();

  const organizationId =
    input.organizationId.trim();

  await requireOrganizationAccess({
    userId: actorUserId,
    organizationId
  });

  const invoiceId = input.invoiceId?.trim();
  const customerId = input.customerId?.trim();
  const orderId = input.orderId?.trim();
  const query = input.query?.trim();

  const invoices = await db.invoice.findMany({
    where: {
      organizationId,
      ...(invoiceId ? { id: invoiceId } : {}),
      ...(customerId
        ? { customerId }
        : {}),
      ...(orderId
        ? { sourceOrderId: orderId }
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
                invoiceNumber: {
                  contains: query,
                  mode: "insensitive" as const
                }
              }
            ]
          }
        : {})
    },
    select: invoiceSelect,
    orderBy: [
      { updatedAt: "desc" },
      { id: "asc" }
    ],
    take: MAX_RESULTS
  });

  return invoices.map(toReality);
}
