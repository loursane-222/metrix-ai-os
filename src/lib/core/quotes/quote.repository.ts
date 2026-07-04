import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { ListQuotesByOrganizationInput, QuoteResult, UpdateQuoteLifecycleInput } from "./quote.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

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

export async function updateQuoteLifecycle(
  input: UpdateQuoteLifecycleInput,
  tx?: PrismaTransactionClient,
): Promise<void> {
  const client: PrismaClientLike = tx ?? prisma;

  await client.quote.updateMany({
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
}
