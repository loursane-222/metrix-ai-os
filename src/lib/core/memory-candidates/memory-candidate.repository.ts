import { MemoryCandidateStatus } from "@prisma/client";
import type { MemoryCandidateStatus as MemoryCandidateStatusType } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type {
  CreateMemoryCandidateRepositoryInput,
  MemoryCandidateResult,
} from "./memory-candidate.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function createCandidate(
  input: CreateMemoryCandidateRepositoryInput,
  tx?: PrismaTransactionClient,
): Promise<MemoryCandidateResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.memoryCandidate.create({
    data: {
      organizationId: input.organizationId,
      createdByUserId: input.createdByUserId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      proposedType: input.proposedType,
      proposedKey: input.proposedKey,
      proposedValue: input.proposedValue,
      source: input.source,
      confidence: input.confidence,
      isAssumption: input.isAssumption ?? true,
      reason: input.reason,
      evidenceJson: input.evidenceJson,
      metadata: input.metadata,
      sourceEventId: input.sourceEventId,
      sourceMessageId: input.sourceMessageId,
      status: MemoryCandidateStatus.PENDING,
    },
  });
}

export async function listPendingByOrganization(
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<MemoryCandidateResult[]> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.memoryCandidate.findMany({
    where: {
      organizationId,
      status: MemoryCandidateStatus.PENDING,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function findByIdForOrganization(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<MemoryCandidateResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.memoryCandidate.findFirst({
    where: {
      id,
      organizationId,
    },
  });
}

export async function markApproved(
  id: string,
  organizationId: string,
  reviewedByUserId: string,
  tx?: PrismaTransactionClient,
): Promise<MemoryCandidateResult | null> {
  return markReviewed({
    id,
    organizationId,
    reviewedByUserId,
    status: MemoryCandidateStatus.APPROVED,
    tx,
  });
}

export async function markRejected(
  id: string,
  organizationId: string,
  reviewedByUserId: string,
  tx?: PrismaTransactionClient,
): Promise<MemoryCandidateResult | null> {
  return markReviewed({
    id,
    organizationId,
    reviewedByUserId,
    status: MemoryCandidateStatus.REJECTED,
    tx,
  });
}

export async function markDismissed(
  id: string,
  organizationId: string,
  reviewedByUserId: string,
  tx?: PrismaTransactionClient,
): Promise<MemoryCandidateResult | null> {
  return markReviewed({
    id,
    organizationId,
    reviewedByUserId,
    status: MemoryCandidateStatus.DISMISSED,
    tx,
  });
}

export async function markExpired(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<MemoryCandidateResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  await client.memoryCandidate.updateMany({
    where: {
      id,
      organizationId,
      status: MemoryCandidateStatus.PENDING,
    },
    data: {
      status: MemoryCandidateStatus.EXPIRED,
    },
  });

  return findByIdForOrganization(id, organizationId, tx);
}

async function markReviewed(input: {
  id: string;
  organizationId: string;
  reviewedByUserId: string;
  status: MemoryCandidateStatusType;
  tx?: PrismaTransactionClient;
}): Promise<MemoryCandidateResult | null> {
  const client: PrismaClientLike = input.tx ?? prisma;

  await client.memoryCandidate.updateMany({
    where: {
      id: input.id,
      organizationId: input.organizationId,
      status: MemoryCandidateStatus.PENDING,
    },
    data: {
      status: input.status,
      reviewedByUserId: input.reviewedByUserId,
      reviewedAt: new Date(),
    },
  });

  return findByIdForOrganization(input.id, input.organizationId, input.tx);
}
