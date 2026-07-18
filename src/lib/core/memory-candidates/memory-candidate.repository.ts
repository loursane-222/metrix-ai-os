import { MemoryCandidateStatus } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type {
  CreateMemoryCandidateRepositoryInput,
  MemoryCandidateResult,
} from "./memory-candidate.types";
import type { KnowledgeAuthorityDecision } from "@/lib/executive-knowledge-authority";
import {
  assertMemoryCandidateTransitionAuthorization,
  type MemoryCandidateTransition,
  type MemoryCandidateTransitionAuthorization,
} from "./memory-candidate-transition-authorization";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function createCandidate(
  input: CreateMemoryCandidateRepositoryInput,
  authorityDecision: KnowledgeAuthorityDecision,
  tx?: PrismaTransactionClient,
): Promise<MemoryCandidateResult> {
  if (authorityDecision.canonicalOwner !== "MEMORY_CANDIDATE") {
    throw new Error("Knowledge Authority rejected MemoryCandidate persistence.");
  }
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
  authorization: MemoryCandidateTransitionAuthorization,
  tx?: PrismaTransactionClient,
): Promise<MemoryCandidateResult | null> {
  return markReviewed(authorization, "APPROVE", MemoryCandidateStatus.APPROVED, tx);
}

export async function markRejected(
  authorization: MemoryCandidateTransitionAuthorization,
  tx?: PrismaTransactionClient,
): Promise<MemoryCandidateResult | null> {
  return markReviewed(authorization, "REJECT", MemoryCandidateStatus.REJECTED, tx);
}

export async function markDismissed(
  authorization: MemoryCandidateTransitionAuthorization,
  tx?: PrismaTransactionClient,
): Promise<MemoryCandidateResult | null> {
  return markReviewed(authorization, "DISMISS", MemoryCandidateStatus.DISMISSED, tx);
}

export async function markExpired(
  authorization: MemoryCandidateTransitionAuthorization,
  tx?: PrismaTransactionClient,
): Promise<MemoryCandidateResult | null> {
  assertMemoryCandidateTransitionAuthorization(authorization, "EXPIRE");
  const client: PrismaClientLike = tx ?? prisma;

  const result = await client.memoryCandidate.updateMany({
    where: {
      id: authorization.targetId,
      organizationId: authorization.organizationId,
      status: MemoryCandidateStatus.PENDING,
    },
    data: {
      status: MemoryCandidateStatus.EXPIRED,
    },
  });

  if (result.count !== 1) return null;
  return findByIdForOrganization(authorization.targetId, authorization.organizationId, tx);
}

async function markReviewed(
  authorization: MemoryCandidateTransitionAuthorization,
  transition: MemoryCandidateTransition,
  status: MemoryCandidateStatus,
  tx?: PrismaTransactionClient,
): Promise<MemoryCandidateResult | null> {
  assertMemoryCandidateTransitionAuthorization(authorization, transition);
  const client: PrismaClientLike = tx ?? prisma;

  const result = await client.memoryCandidate.updateMany({
    where: {
      id: authorization.targetId,
      organizationId: authorization.organizationId,
      status: MemoryCandidateStatus.PENDING,
    },
    data: {
      status,
      reviewedByUserId: authorization.actorUserId,
      reviewedAt: new Date(),
    },
  });

  if (result.count !== 1) return null;
  return findByIdForOrganization(authorization.targetId, authorization.organizationId, tx);
}
