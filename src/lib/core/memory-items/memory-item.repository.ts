import { MemoryItemStatus } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type {
  CreateApprovedMemoryItemRepositoryInput,
  MemoryItemResult,
} from "./memory-item.types";
import type { KnowledgeAuthorityDecision } from "@/lib/executive-knowledge-authority";
import {
  assertMemoryItemTransitionAuthorization,
  type MemoryItemTransitionAuthorization,
} from "./memory-item-transition-authorization";

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
  authorityDecision: KnowledgeAuthorityDecision,
  tx?: PrismaTransactionClient,
): Promise<MemoryItemResult> {
  if (authorityDecision.canonicalOwner !== "MEMORY_ITEM") {
    throw new Error("Knowledge Authority rejected MemoryItem persistence.");
  }
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
  authorization: MemoryItemTransitionAuthorization,
  tx?: PrismaTransactionClient,
): Promise<MemoryItemResult | null> {
  assertMemoryItemTransitionAuthorization(authorization, "DELETE");
  const client: PrismaClientLike = tx ?? prisma;

  const result = await client.memoryItem.updateMany({
    where: {
      id: authorization.targetId,
      organizationId: authorization.organizationId,
      status: MemoryItemStatus.ACTIVE,
    },
    data: {
      status: MemoryItemStatus.DELETED,
      deletedAt: new Date(),
      deletedByUserId: authorization.actorUserId,
    },
  });

  if (result.count !== 1) return null;
  return findByIdForOrganization(authorization.targetId, authorization.organizationId, tx);
}

export async function markSuperseded(
  authorization: MemoryItemTransitionAuthorization,
  tx?: PrismaTransactionClient,
): Promise<MemoryItemResult | null> {
  assertMemoryItemTransitionAuthorization(authorization, "SUPERSEDE");
  const client: PrismaClientLike = tx ?? prisma;

  const result = await client.memoryItem.updateMany({
    where: {
      id: authorization.targetId,
      organizationId: authorization.organizationId,
      status: MemoryItemStatus.ACTIVE,
    },
    data: {
      status: MemoryItemStatus.SUPERSEDED,
    },
  });

  if (result.count !== 1) return null;
  return findByIdForOrganization(authorization.targetId, authorization.organizationId, tx);
}
