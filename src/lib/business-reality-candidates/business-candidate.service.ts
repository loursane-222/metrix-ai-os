import {
  BusinessCandidateApprovalStatus,
  BusinessCandidatePromotionStatus,
  BusinessCandidateStatus,
  Prisma,
} from "@prisma/client";
import { createHash } from "node:crypto";

import { prisma } from "@/lib/core/shared/prisma";
import type {
  BusinessCandidatePromotionExecutor,
  PersistBusinessPropositionsInput,
} from "./contracts";

export async function persistBusinessPropositions(
  input: PersistBusinessPropositionsInput,
) {
  assertPersistInput(input);

  return prisma.$transaction(async (tx) => {
    const candidates = [];
    for (const [index, proposition] of input.propositions.entries()) {
      const idempotencyKey = candidateKey(input, index);
      const candidate = await tx.businessCandidate.upsert({
        where: {
          organizationId_idempotencyKey: {
            organizationId: input.organizationId,
            idempotencyKey,
          },
        },
        update: {},
        create: {
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          sourceChannel: input.sourceChannel,
          sourceMessageId: input.sourceMessageId,
          sourceEventId: input.sourceEventId,
          propositionType: proposition.propositionType,
          targetDomain: proposition.targetDomain,
          targetRecordId: proposition.targetRecordId,
          operation: proposition.operation,
          status: proposition.requiresApproval === false
            ? BusinessCandidateStatus.PROPOSED
            : BusinessCandidateStatus.PENDING_APPROVAL,
          confidence: proposition.confidence,
          provenanceJson: toJson(proposition.provenance),
          requiresApproval: proposition.requiresApproval ?? true,
          idempotencyKey,
          expiresAt: input.expiresAt,
          changes: {
            create: proposition.changes.map((change) => ({
              fieldPath: change.fieldPath,
              previousValue: toNullableJson(change.previousValue),
              proposedValue: toJson(change.proposedValue),
              approvalStatus: BusinessCandidateApprovalStatus.PENDING,
            })),
          },
          audits: {
            create: {
              organizationId: input.organizationId,
              toStatus: proposition.requiresApproval === false
                ? BusinessCandidateStatus.PROPOSED
                : BusinessCandidateStatus.PENDING_APPROVAL,
              reasonCode: "BUSINESS_PROPOSITION_PERSISTED",
              metadataJson: { propositionIndex: index },
            },
          },
        },
        include: { changes: true },
      });
      candidates.push(candidate);
    }
    return candidates;
  });
}

export async function decideBusinessCandidateChanges(input: Readonly<{
  organizationId: string;
  candidateId: string;
  actorUserId: string;
  approvedChangeIds: readonly string[];
  rejectedChangeIds: readonly string[];
  reason?: string;
}>) {
  return prisma.$transaction(async (tx) => {
    const candidate = await tx.businessCandidate.findFirst({
      where: { id: input.candidateId, organizationId: input.organizationId },
      include: { changes: true },
    });
    if (!candidate) throw new Error("BUSINESS_CANDIDATE_NOT_FOUND");

    const ownedIds = new Set(candidate.changes.map((change) => change.id));
    const decisionIds = [...input.approvedChangeIds, ...input.rejectedChangeIds];
    if (decisionIds.some((id) => !ownedIds.has(id))) {
      throw new Error("BUSINESS_CANDIDATE_CHANGE_SCOPE_VIOLATION");
    }
    if (new Set(decisionIds).size !== decisionIds.length) {
      throw new Error("BUSINESS_CANDIDATE_CHANGE_DECISION_CONFLICT");
    }

    if (input.approvedChangeIds.length > 0) {
      await tx.businessCandidateChange.updateMany({
        where: { candidateId: candidate.id, id: { in: [...input.approvedChangeIds] } },
        data: {
          approvalStatus: BusinessCandidateApprovalStatus.APPROVED,
        },
      });
    }
    if (input.rejectedChangeIds.length > 0) {
      await tx.businessCandidateChange.updateMany({
        where: { candidateId: candidate.id, id: { in: [...input.rejectedChangeIds] } },
        data: {
          approvalStatus: BusinessCandidateApprovalStatus.REJECTED,
        },
      });
    }

    const total = candidate.changes.length;
    const approved = input.approvedChangeIds.length;
    const rejected = input.rejectedChangeIds.length;
    const status = approved === total
      ? BusinessCandidateStatus.APPROVED
      : rejected === total
        ? BusinessCandidateStatus.REJECTED
        : approved + rejected === total
          ? BusinessCandidateStatus.PARTIALLY_APPROVED
          : BusinessCandidateStatus.PENDING_APPROVAL;

    await tx.businessCandidate.update({
      where: { id: candidate.id },
      data: { status },
    });
    await tx.businessCandidateAudit.create({
      data: {
        organizationId: input.organizationId,
        candidateId: candidate.id,
        fromStatus: candidate.status,
        toStatus: status,
        actorUserId: input.actorUserId,
        reasonCode: input.reason ?? "FIELD_CHANGE_DECISION",
        metadataJson: {
          approvedChangeIds: [...input.approvedChangeIds],
          rejectedChangeIds: [...input.rejectedChangeIds],
        },
      },
    });
    return tx.businessCandidate.findUniqueOrThrow({
      where: { id: candidate.id },
      include: { changes: true, audits: true },
    });
  });
}

export async function promoteBusinessCandidate(input: Readonly<{
  organizationId: string;
  candidateId: string;
  actorUserId?: string | null;
  systemAuthority?: string | null;
  execute: BusinessCandidatePromotionExecutor;
}>) {
  const candidate = await prisma.businessCandidate.findFirst({
    where: { id: input.candidateId, organizationId: input.organizationId },
    include: { changes: true, promotionReceipts: true },
  });
  if (!candidate) throw new Error("BUSINESS_CANDIDATE_NOT_FOUND");
  const approved = candidate.changes.filter(
    (change) => change.approvalStatus === BusinessCandidateApprovalStatus.APPROVED,
  );
  if (approved.length === 0) throw new Error("BUSINESS_CANDIDATE_HAS_NO_APPROVED_CHANGES");

  const idempotencyKey = `business-candidate:${candidate.id}:promotion:v1`;
  const prior = candidate.promotionReceipts.find(
    (receipt) => receipt.idempotencyKey === idempotencyKey,
  );
  if (prior) return prior;

  await transitionCandidate(candidate.id, input.organizationId, candidate.status, BusinessCandidateStatus.PROMOTING);
  const execution = await input.execute({
    candidateId: candidate.id,
    organizationId: input.organizationId,
    targetDomain: candidate.targetDomain,
    targetRecordId: candidate.targetRecordId,
    operation: candidate.operation,
    approvedChanges: approved.map((change) => ({
      changeId: change.id,
      fieldPath: change.fieldPath,
      proposedValue: change.proposedValue,
    })),
    idempotencyKey,
  });

  return prisma.$transaction(async (tx) => {
    const receipt = await tx.businessCandidatePromotionReceipt.create({
      data: {
        organizationId: input.organizationId,
        candidateId: candidate.id,
        approvedChangeIds: approved.map((change) => change.id),
        targetDomain: candidate.targetDomain,
        targetRecordId: execution.targetRecordId,
        canonicalOperation: execution.canonicalOperation,
        executionId: execution.executionId,
        actorUserId: input.actorUserId,
        systemAuthority: input.systemAuthority,
        status: execution.success
          ? BusinessCandidatePromotionStatus.SUCCEEDED
          : BusinessCandidatePromotionStatus.FAILED,
        errorCode: execution.errorCode,
        idempotencyKey,
      },
    });
    const next = execution.success
      ? BusinessCandidateStatus.PROMOTED
      : BusinessCandidateStatus.FAILED;
    await tx.businessCandidate.update({
      where: { id: candidate.id },
      data: { status: next, targetRecordId: execution.targetRecordId },
    });
    await tx.businessCandidateAudit.create({
      data: {
        organizationId: input.organizationId,
        candidateId: candidate.id,
        fromStatus: BusinessCandidateStatus.PROMOTING,
        toStatus: next,
        actorUserId: input.actorUserId,
        reasonCode: execution.success
          ? "CANONICAL_PROMOTION_SUCCEEDED"
          : "CANONICAL_PROMOTION_FAILED",
        metadataJson: { executionId: execution.executionId },
      },
    });
    return receipt;
  });
}

async function transitionCandidate(
  candidateId: string,
  organizationId: string,
  fromStatus: BusinessCandidateStatus,
  toStatus: BusinessCandidateStatus,
) {
  await prisma.$transaction([
    prisma.businessCandidate.updateMany({
      where: { id: candidateId, organizationId, status: fromStatus },
      data: { status: toStatus },
    }),
    prisma.businessCandidateAudit.create({
      data: {
        organizationId,
        candidateId,
        fromStatus,
        toStatus,
        reasonCode: "PROMOTION_STARTED",
      },
    }),
  ]);
}

function candidateKey(input: PersistBusinessPropositionsInput, index: number): string {
  return createHash("sha256")
    .update(`${input.organizationId}\0${input.sourceInputId}\0${index}`)
    .digest("hex");
}

function assertPersistInput(input: PersistBusinessPropositionsInput): void {
  if (!input.organizationId.trim() || !input.sourceInputId.trim()) {
    throw new TypeError("organizationId and sourceInputId are required.");
  }
  for (const proposition of input.propositions) {
    if (!proposition.targetDomain.trim() || proposition.changes.length === 0) {
      throw new TypeError("Each business proposition needs a target domain and atomic changes.");
    }
    const fieldPaths = proposition.changes.map((change) => change.fieldPath);
    if (fieldPaths.some((path) => !path.trim()) || new Set(fieldPaths).size !== fieldPaths.length) {
      throw new TypeError("Candidate field paths must be non-empty and unique per proposition.");
    }
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toNullableJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  return value === undefined ? undefined : value === null ? Prisma.JsonNull : toJson(value);
}
