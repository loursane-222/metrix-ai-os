import type { QuoteItem } from "@prisma/client";

export type QuoteItemResult = QuoteItem;

export type CreateQuoteItemInput = {
  organizationId: string;
  quoteId: string;
  productServiceId?: string | null;
  name: string;
  unit?: string | null;
  quantity: number;
  unitPriceCents: bigint;
  discountBasisPoints?: number;
  vatRateBasisPoints?: number;
  sortOrder: number;
};

export type UpdateQuoteItemInput = {
  id: string;
  organizationId: string;
  name?: string;
  unit?: string | null;
  quantity?: number;
  unitPriceCents?: bigint;
  discountBasisPoints?: number;
  vatRateBasisPoints?: number;
};
