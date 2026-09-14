import {
  db
} from "../db";

import {
  requireOrganizationAccess
} from "../auth/organization-access";

export type QuoteItemReality = {
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

export type QuoteReality = {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  amount: number | null;
  currency: string;
  status: "DRAFT";
  notes: string | null;
  customerNote: string | null;
  specialTerms: string | null;
  validUntil: string | null;
  generalDiscountBasisPoints: number | null;
  deliveryTerm: string | null;
  deliveryMethod: string | null;
  updatedAt: string;
  items: QuoteItemReality[];
};

const MAX_RESULTS = 20;

const quoteSelect = {
  id: true,
  customerId: true,
  customerName: true,
  title: true,
  amount: true,
  currency: true,
  status: true,
  notes: true,
  customerNote: true,
  specialTerms: true,
  validUntil: true,
  generalDiscountBasisPoints: true,
  deliveryTerm: true,
  deliveryMethod: true,
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

type RawQuoteWithItems = {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  amount: unknown;
  currency: string;
  status: "DRAFT";
  notes: string | null;
  customerNote: string | null;
  specialTerms: string | null;
  validUntil: Date | null;
  generalDiscountBasisPoints: number | null;
  deliveryTerm: string | null;
  deliveryMethod: string | null;
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
  quote: RawQuoteWithItems
): QuoteReality {
  return {
    id: quote.id,
    customerId: quote.customerId,
    customerName: quote.customerName,
    title: quote.title,
    amount:
      quote.amount === null
        ? null
        : Number(quote.amount),
    currency: quote.currency,
    status: quote.status,
    notes: quote.notes,
    customerNote: quote.customerNote,
    specialTerms: quote.specialTerms,
    validUntil:
      quote.validUntil?.toISOString() ?? null,
    generalDiscountBasisPoints:
      quote.generalDiscountBasisPoints,
    deliveryTerm: quote.deliveryTerm,
    deliveryMethod: quote.deliveryMethod,
    updatedAt: quote.updatedAt.toISOString(),
    items: quote.items.map(item => ({
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

export async function listQuotesForOrganization(
  input: {
    actorUserId: string;
    organizationId: string;
    quoteId?: string;
    query?: string;
    customerId?: string;
    status?: "DRAFT";
  }
): Promise<QuoteReality[]> {
  const actorUserId =
    input.actorUserId.trim();

  const organizationId =
    input.organizationId.trim();

  await requireOrganizationAccess({
    userId: actorUserId,
    organizationId
  });

  const quoteId = input.quoteId?.trim();
  const customerId = input.customerId?.trim();
  const query = input.query?.trim();

  const quotes = await db.quote.findMany({
    where: {
      organizationId,
      ...(quoteId ? { id: quoteId } : {}),
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
              }
            ]
          }
        : {})
    },
    select: quoteSelect,
    orderBy: [
      { updatedAt: "desc" },
      { id: "asc" }
    ],
    take: MAX_RESULTS
  });

  return quotes.map(toReality);
}

export async function getQuoteWithItemsForOrganization(
  input: {
    actorUserId: string;
    organizationId: string;
    quoteId: string;
  }
): Promise<QuoteReality | null> {
  const actorUserId =
    input.actorUserId.trim();

  const organizationId =
    input.organizationId.trim();

  const quoteId = input.quoteId.trim();

  await requireOrganizationAccess({
    userId: actorUserId,
    organizationId
  });

  const quote = await db.quote.findFirst({
    where: {
      id: quoteId,
      organizationId
    },
    select: quoteSelect
  });

  return quote ? toReality(quote) : null;
}
