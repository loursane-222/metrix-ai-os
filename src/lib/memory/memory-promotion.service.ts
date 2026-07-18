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
import {
  buildKnowledgeAuthorityMetadata,
  evaluateKnowledgeSignal,
} from "@/lib/executive-knowledge-authority";
import {
  markApproved as markCandidateApproved,
  markDismissed as markCandidateDismissed,
} from "@/lib/core/memory-candidates/memory-candidate.repository";
import { authorizeMemoryCandidateTransition } from "@/lib/core/memory-candidates/memory-candidate-transition-authorization";
import { authorizeMemoryItemTransition } from "@/lib/core/memory-items/memory-item-transition-authorization";

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

      const authorityDecision = evaluateKnowledgeSignal({
        producer: readCandidateProducer(candidate),
        key: candidate.proposedKey,
        value: candidate.proposedValue,
        memoryItemType: candidate.proposedType,
        memorySource: candidate.source,
        userConfirmed: true,
        isAssumption: false,
        durable: true,
        confidence: candidate.confidence,
      });

      if (
        authorityDecision.canonicalOwner === "DISCARD" ||
        authorityDecision.promotionPolicy === "NONE"
      ) {
        return buildResult(candidate.id, "AUTHORITY_REJECTED");
      }

      const memoryAuthorityDecision = evaluateKnowledgeSignal({
        producer: "CANDIDATE_APPROVED",
        key: candidate.proposedKey,
        value: candidate.proposedValue,
        memoryItemType: candidate.proposedType,
        memorySource: MemoryItemSource.CANDIDATE_APPROVED,
        userConfirmed: true,
        durable: true,
        confidence: candidate.confidence,
        metadata: { originalProducer: authorityDecision.signal.producer },
      });

      const activeMemoryItems = await listActiveByOrganization(
        input.organizationId,
        tx,
      );
      const exactDuplicate = findExactDuplicate(candidate, activeMemoryItems);

      if (exactDuplicate) {
        const dismissed = await markCandidateDismissed(
          authorizeMemoryCandidateTransition({
            transition: "DISMISS",
            organizationId: input.organizationId,
            targetId: candidate.id,
            actorUserId: input.approverUserId,
            sourceService: "memory-promotion.duplicate",
          }),
          tx,
        );

        if (!dismissed || dismissed.status !== MemoryCandidateStatus.DISMISSED) {
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

      const claimedCandidate = await markCandidateApproved(
        authorizeMemoryCandidateTransition({
          transition: "APPROVE",
          organizationId: input.organizationId,
          targetId: candidate.id,
          actorUserId: input.approverUserId,
          sourceService: "memory-promotion.approve",
        }),
        tx,
      );

      if (!claimedCandidate || claimedCandidate.status !== MemoryCandidateStatus.APPROVED) {
        return buildResult(candidate.id, "CANDIDATE_NOT_PENDING");
      }

      if (supersedesMemory) {
        const superseded = await markSuperseded(authorizeMemoryItemTransition({
          transition: "SUPERSEDE",
          organizationId: input.organizationId,
          targetId: supersedesMemory.id,
          actorUserId: input.approverUserId,
          sourceService: "memory-promotion.approve",
        }), tx);
        if (!superseded || superseded.status !== MemoryItemStatus.SUPERSEDED) {
          throw new Error("MemoryItem supersede transition lost its active-state race.");
        }
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
          metadata: {
            ...buildPromotionMetadata(candidate),
            candidateAuthority: buildKnowledgeAuthorityMetadata(authorityDecision),
            ...buildKnowledgeAuthorityMetadata(memoryAuthorityDecision),
          } as Prisma.InputJsonObject,
        },
        memoryAuthorityDecision,
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

function readCandidateProducer(candidate: MemoryCandidateResult): string {
  if (candidate.metadata && typeof candidate.metadata === "object" && !Array.isArray(candidate.metadata)) {
    const authority = (candidate.metadata as Record<string, unknown>).knowledgeAuthority;
    if (authority && typeof authority === "object" && !Array.isArray(authority)) {
      const producer = (authority as Record<string, unknown>).producer;
      if (typeof producer === "string" && producer.length > 0) return producer;
    }
  }
  return candidate.source === MemoryItemSource.SYSTEM_INFERRED
    ? "RECOGNITION_RESULT"
    : candidate.source === MemoryItemSource.ONBOARDING
      ? "ONBOARDING"
      : "USER_STATEMENT";
}
