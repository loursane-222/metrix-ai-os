import {
  MemoryCandidateStatus,
  MemoryItemSource,
  MemoryItemStatus,
  Prisma,
} from "@prisma/client";

import {
  findByIdForOrganization as findMemoryItemByIdForOrganization,
  listActiveByOrganization,
  markSuperseded,
  createApprovedItem,
} from "@/lib/core/memory-items/memory-item.repository";
import { prisma } from "@/lib/core/shared/prisma";

import type { MemoryCandidateResult } from "@/lib/core/memory-candidates/memory-candidate.types";
import type { MemoryItemResult } from "@/lib/core/memory-items/memory-item.types";
import type {
  ApproveMemoryCandidateForOrganizationInput,
  MemoryPromotionResult,
} from "./memory-promotion.types";

export async function approveMemoryCandidateForOrganization(
  input: ApproveMemoryCandidateForOrganizationInput,
): Promise<MemoryPromotionResult> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.candidateId, "candidateId");
  assertNonEmpty(input.approverUserId, "approverUserId");

  return prisma.$transaction(
    async (tx) => {
      const candidate = await tx.memoryCandidate.findFirst({
        where: {
          id: input.candidateId,
          organizationId: input.organizationId,
          status: MemoryCandidateStatus.PENDING,
        },
      });

      if (!candidate) {
        return buildResult(input.candidateId, "CANDIDATE_NOT_PENDING");
      }

      const activeMemoryItems = await listActiveByOrganization(
        input.organizationId,
        tx,
      );
      const exactDuplicate = findExactDuplicate(candidate, activeMemoryItems);

      if (exactDuplicate) {
        const dismissed = await dismissPendingCandidate({
          candidateId: candidate.id,
          organizationId: input.organizationId,
          reviewedByUserId: input.approverUserId,
          tx,
        });

        if (!dismissed) {
          return buildResult(candidate.id, "CANDIDATE_NOT_PENDING");
        }

        return buildResult(candidate.id, "DUPLICATE_ACTIVE_MEMORY");
      }

      const supersedeConflict = findSupersedeConflict(
        candidate,
        activeMemoryItems,
      );
      const supersedesMemoryId =
        input.supersedesMemoryId ?? readSupersedesMemoryId(candidate);

      if (!supersedesMemoryId && supersedeConflict) {
        return buildResult(candidate.id, "SUPERSEDE_REQUIRED");
      }

      let supersedesMemory: MemoryItemResult | null = null;

      if (supersedesMemoryId) {
        supersedesMemory = await findMemoryItemByIdForOrganization(
          supersedesMemoryId,
          input.organizationId,
          tx,
        );

        if (!isValidSupersedeTarget(candidate, supersedesMemory)) {
          return buildResult(candidate.id, "INVALID_SUPERSEDE_TARGET");
        }
      }

      const claimedCandidate = await approvePendingCandidate({
        candidateId: candidate.id,
        organizationId: input.organizationId,
        reviewedByUserId: input.approverUserId,
        tx,
      });

      if (!claimedCandidate) {
        return buildResult(candidate.id, "CANDIDATE_NOT_PENDING");
      }

      if (supersedesMemory) {
        await markSuperseded(supersedesMemory.id, input.organizationId, tx);
      }

      const memoryItem = await createApprovedItem(
        {
          organizationId: input.organizationId,
          createdByUserId: input.approverUserId,
          subjectType: candidate.subjectType,
          subjectId: candidate.subjectId,
          type: candidate.proposedType,
          key: candidate.proposedKey,
          value: candidate.proposedValue,
          source: MemoryItemSource.CANDIDATE_APPROVED,
          confidence: candidate.confidence,
          isUserConfirmed: true,
          sourceEventId: candidate.sourceEventId,
          sourceCandidateId: candidate.id,
          supersedesMemoryId: supersedesMemory?.id,
          metadata: buildPromotionMetadata(candidate),
        },
        tx,
      );

      return {
        promoted: true,
        reason: "PROMOTED",
        candidateId: candidate.id,
        memoryItemId: memoryItem.id,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

async function approvePendingCandidate(input: {
  candidateId: string;
  organizationId: string;
  reviewedByUserId: string;
  tx: Prisma.TransactionClient;
}): Promise<MemoryCandidateResult | null> {
  const result = await input.tx.memoryCandidate.updateMany({
    where: {
      id: input.candidateId,
      organizationId: input.organizationId,
      status: MemoryCandidateStatus.PENDING,
    },
    data: {
      status: MemoryCandidateStatus.APPROVED,
      reviewedByUserId: input.reviewedByUserId,
      reviewedAt: new Date(),
    },
  });

  if (result.count !== 1) {
    return null;
  }

  return input.tx.memoryCandidate.findFirst({
    where: {
      id: input.candidateId,
      organizationId: input.organizationId,
    },
  });
}

async function dismissPendingCandidate(input: {
  candidateId: string;
  organizationId: string;
  reviewedByUserId: string;
  tx: Prisma.TransactionClient;
}): Promise<boolean> {
  const result = await input.tx.memoryCandidate.updateMany({
    where: {
      id: input.candidateId,
      organizationId: input.organizationId,
      status: MemoryCandidateStatus.PENDING,
    },
    data: {
      status: MemoryCandidateStatus.DISMISSED,
      reviewedByUserId: input.reviewedByUserId,
      reviewedAt: new Date(),
    },
  });

  return result.count === 1;
}

function findExactDuplicate(
  candidate: MemoryCandidateResult,
  memoryItems: MemoryItemResult[],
): MemoryItemResult | undefined {
  const candidateKey = buildMemoryKey({
    type: candidate.proposedType,
    key: candidate.proposedKey,
    value: candidate.proposedValue,
  });

  return memoryItems.find(
    (memoryItem) =>
      memoryItem.status === MemoryItemStatus.ACTIVE &&
      memoryItem.deletedAt === null &&
      buildMemoryKey({
        type: memoryItem.type,
        key: memoryItem.key,
        value: memoryItem.value,
      }) === candidateKey,
  );
}

function findSupersedeConflict(
  candidate: MemoryCandidateResult,
  memoryItems: MemoryItemResult[],
): MemoryItemResult | undefined {
  return memoryItems.find(
    (memoryItem) =>
      memoryItem.status === MemoryItemStatus.ACTIVE &&
      memoryItem.deletedAt === null &&
      memoryItem.type === candidate.proposedType &&
      normalizeValue(memoryItem.key) === normalizeValue(candidate.proposedKey) &&
      normalizeValue(memoryItem.value) !==
        normalizeValue(candidate.proposedValue),
  );
}

function isValidSupersedeTarget(
  candidate: MemoryCandidateResult,
  memoryItem: MemoryItemResult | null,
): memoryItem is MemoryItemResult {
  return (
    memoryItem !== null &&
    memoryItem.status === MemoryItemStatus.ACTIVE &&
    memoryItem.deletedAt === null &&
    memoryItem.type === candidate.proposedType &&
    normalizeValue(memoryItem.key) === normalizeValue(candidate.proposedKey) &&
    normalizeValue(memoryItem.value) !== normalizeValue(candidate.proposedValue)
  );
}

function buildPromotionMetadata(
  candidate: MemoryCandidateResult,
): Prisma.InputJsonObject {
  const candidateMetadata =
    candidate.metadata === null
      ? {}
      : {
          candidateMetadata: candidate.metadata as Prisma.InputJsonValue,
        };
  const candidateEvidenceJson =
    candidate.evidenceJson === null
      ? {}
      : {
          candidateEvidenceJson: candidate.evidenceJson as Prisma.InputJsonValue,
        };

  return {
    promotedFromCandidate: true,
    candidateSource: candidate.source,
    candidateReason: candidate.reason,
    candidateWasAssumption: candidate.isAssumption,
    ...candidateMetadata,
    ...candidateEvidenceJson,
  };
}

function readSupersedesMemoryId(
  candidate: MemoryCandidateResult,
): string | null {
  if (!candidate.metadata || typeof candidate.metadata !== "object") {
    return null;
  }

  if (Array.isArray(candidate.metadata)) {
    return null;
  }

  const metadata = candidate.metadata as Record<string, unknown>;
  const supersedesMemoryId = metadata.supersedesMemoryId;

  return typeof supersedesMemoryId === "string" &&
    supersedesMemoryId.trim().length > 0
    ? supersedesMemoryId
    : null;
}

function buildMemoryKey(input: {
  type: string;
  key: string;
  value: string;
}): string {
  return [
    input.type,
    normalizeValue(input.key),
    normalizeValue(input.value),
  ].join(":");
}

function normalizeValue(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}

function buildResult(
  candidateId: string,
  reason: MemoryPromotionResult["reason"],
): MemoryPromotionResult {
  return {
    promoted: false,
    reason,
    candidateId,
  };
}

function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }
}
