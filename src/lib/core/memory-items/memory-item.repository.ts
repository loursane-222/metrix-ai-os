import { MemoryItemStatus } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type {
  CreateApprovedMemoryItemRepositoryInput,
  MemoryItemResult,
} from "./memory-item.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function listActiveByOrganization(
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<MemoryItemResult[]> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.memoryItem.findMany({
    where: {
      organizationId,
      status: MemoryItemStatus.ACTIVE,
      deletedAt: null,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
}

export async function findByIdForOrganization(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<MemoryItemResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.memoryItem.findFirst({
    where: {
      id,
      organizationId,
    },
  });
}

export async function createApprovedItem(
  input: CreateApprovedMemoryItemRepositoryInput,
  tx?: PrismaTransactionClient,
): Promise<MemoryItemResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.memoryItem.create({
    data: {
      organizationId: input.organizationId,
      createdByUserId: input.createdByUserId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      type: input.type,
      key: input.key,
      value: input.value,
      source: input.source,
      confidence: input.confidence,
      status: MemoryItemStatus.ACTIVE,
      isUserConfirmed: input.isUserConfirmed ?? false,
      sourceEventId: input.sourceEventId,
      sourceCandidateId: input.sourceCandidateId,
      supersedesMemoryId: input.supersedesMemoryId,
      metadata: input.metadata,
    },
  });
}

export async function markDeleted(
  id: string,
  organizationId: string,
  deletedByUserId: string,
  tx?: PrismaTransactionClient,
): Promise<MemoryItemResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  await client.memoryItem.updateMany({
    where: {
      id,
      organizationId,
    },
    data: {
      status: MemoryItemStatus.DELETED,
      deletedAt: new Date(),
      deletedByUserId,
    },
  });

  return findByIdForOrganization(id, organizationId, tx);
}

export async function markSuperseded(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<MemoryItemResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  await client.memoryItem.updateMany({
    where: {
      id,
      organizationId,
    },
    data: {
      status: MemoryItemStatus.SUPERSEDED,
    },
  });

  return findByIdForOrganization(id, organizationId, tx);
}
