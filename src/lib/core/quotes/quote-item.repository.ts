import { prisma } from "@/lib/core/shared/prisma";
import { computeLineTotalCents } from "./quote-totals";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { CreateQuoteItemInput, QuoteItemResult, UpdateQuoteItemInput } from "./quote-item.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function listQuoteItems(
  quoteId: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<QuoteItemResult[]> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.quoteItem.findMany({
    where: { quoteId, organizationId },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createQuoteItem(
  input: CreateQuoteItemInput,
  tx?: PrismaTransactionClient,
): Promise<QuoteItemResult> {
  const client: PrismaClientLike = tx ?? prisma;
  const discountBasisPoints = input.discountBasisPoints ?? 0;
  const vatRateBasisPoints = input.vatRateBasisPoints ?? 0;
  const lineTotalCents = computeLineTotalCents({
    quantity: input.quantity,
    unitPriceCents: input.unitPriceCents,
    discountBasisPoints,
    vatRateBasisPoints,
  });

  return client.quoteItem.create({
    data: {
      organizationId: input.organizationId,
      quoteId: input.quoteId,
      productServiceId: input.productServiceId ?? null,
      name: input.name,
      unit: input.unit ?? null,
      quantity: input.quantity,
      unitPriceCents: input.unitPriceCents,
      discountBasisPoints,
      vatRateBasisPoints,
      lineTotalCents,
      sortOrder: input.sortOrder,
    },
  });
}

export async function updateQuoteItem(
  input: UpdateQuoteItemInput,
  tx?: PrismaTransactionClient,
): Promise<QuoteItemResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  const existing = await client.quoteItem.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
  if (!existing) return null;

  const quantity = input.quantity ?? Number(existing.quantity);
  const unitPriceCents = input.unitPriceCents ?? existing.unitPriceCents;
  const discountBasisPoints = input.discountBasisPoints ?? existing.discountBasisPoints;
  const vatRateBasisPoints = input.vatRateBasisPoints ?? existing.vatRateBasisPoints;
  const lineTotalCents = computeLineTotalCents({ quantity, unitPriceCents, discountBasisPoints, vatRateBasisPoints });

  return client.quoteItem.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      quantity,
      unitPriceCents,
      discountBasisPoints,
      vatRateBasisPoints,
      lineTotalCents,
    },
  });
}

export async function deleteQuoteItem(id: string, organizationId: string, tx?: PrismaTransactionClient): Promise<boolean> {
  const client: PrismaClientLike = tx ?? prisma;
  const result = await client.quoteItem.deleteMany({ where: { id, organizationId } });
  return result.count === 1;
}
