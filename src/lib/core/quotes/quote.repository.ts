import { prisma } from "@/lib/core/shared/prisma";
import type { Prisma } from "@prisma/client";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type {
  CreateQuoteRepositoryInput,
  ListQuotesByOrganizationInput,
  QuoteResult,
  QuoteWithItems,
  UpdateQuoteCommercialFieldsInput,
  UpdateQuoteLifecycleInput,
} from "./quote.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function createQuote(
  input: CreateQuoteRepositoryInput,
  tx?: PrismaTransactionClient,
): Promise<QuoteResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.quote.create({
    data: {
      organizationId: input.organizationId,
      customerId: input.customerId,
      personId: input.personId,
      customerName: input.customerName,
      title: input.title,
      amount: input.amount ?? null,
      currency: input.currency ?? "TRY",
      notes: input.notes ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      requestHash: input.requestHash ?? null,
      createdByUserId: input.createdByUserId,
    },
  });
}

export async function findByIdempotencyKey(
  organizationId: string,
  idempotencyKey: string,
  tx?: PrismaTransactionClient,
): Promise<QuoteResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.quote.findFirst({
    where: { organizationId, idempotencyKey },
  });
}

export async function listByOrganization(
  input: ListQuotesByOrganizationInput,
  tx?: PrismaTransactionClient,
): Promise<QuoteResult[]> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.quote.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: input.limit ?? 50,
  });
}

export async function findByIdForOrganization(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<QuoteResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.quote.findFirst({
    where: { id, organizationId },
  });
}

export async function findByIdForOrganizationWithItems(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<QuoteWithItems | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.quote.findFirst({
    where: { id, organizationId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function updateQuoteCommercialFields(
  input: UpdateQuoteCommercialFieldsInput,
  tx?: PrismaTransactionClient,
): Promise<boolean> {
  const client: PrismaClientLike = tx ?? prisma;

  const result = await client.quote.updateMany({
    where: { id: input.id, organizationId: input.organizationId },
    data: {
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.generalDiscountBasisPoints !== undefined ? { generalDiscountBasisPoints: input.generalDiscountBasisPoints } : {}),
      ...(input.customerNote !== undefined ? { customerNote: input.customerNote } : {}),
      ...(input.specialTerms !== undefined ? { specialTerms: input.specialTerms } : {}),
      ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
      ...(input.paymentTerm !== undefined ? { paymentTerm: input.paymentTerm } : {}),
      ...(input.deliveryTerm !== undefined ? { deliveryTerm: input.deliveryTerm } : {}),
      ...(input.deliveryMethod !== undefined ? { deliveryMethod: input.deliveryMethod } : {}),
    },
  });
  return result.count === 1;
}

/** Records the outbound email dispatch outcome into Quote.metadata — read-modify-write to avoid clobbering other metadata keys. */
export async function recordQuoteDispatch(
  input: { id: string; organizationId: string; recipientEmail: string; providerMessageId: string | null; dispatchedAt: Date },
  tx?: PrismaTransactionClient,
): Promise<boolean> {
  const client: PrismaClientLike = tx ?? prisma;

  const existing = await client.quote.findFirst({ where: { id: input.id, organizationId: input.organizationId }, select: { metadata: true } });
  if (!existing) return false;

  const currentMetadata: Record<string, unknown> =
    existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata) ? (existing.metadata as Record<string, unknown>) : {};

  const result = await client.quote.updateMany({
    where: { id: input.id, organizationId: input.organizationId },
    data: {
      metadata: {
        ...currentMetadata,
        emailDispatch: {
          recipientEmail: input.recipientEmail,
          providerMessageId: input.providerMessageId,
          dispatchedAt: input.dispatchedAt.toISOString(),
        },
      } satisfies Prisma.InputJsonValue,
    },
  });
  return result.count === 1;
}

export async function updateQuoteLifecycle(
  input: UpdateQuoteLifecycleInput,
  tx?: PrismaTransactionClient,
): Promise<boolean> {
  const client: PrismaClientLike = tx ?? prisma;

  const result = await client.quote.updateMany({
    where: { id: input.id, organizationId: input.organizationId },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.sentAt !== undefined ? { sentAt: input.sentAt } : {}),
      ...(input.viewedAt !== undefined ? { viewedAt: input.viewedAt } : {}),
      ...(input.wonAt !== undefined ? { wonAt: input.wonAt } : {}),
      ...(input.lostAt !== undefined ? { lostAt: input.lostAt } : {}),
    },
  });
  return result.count === 1;
}
