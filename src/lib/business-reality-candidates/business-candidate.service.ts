import {
  BusinessCandidateApprovalStatus,
  BusinessCandidateConflictStatus,
  BusinessCandidatePromotionStatus,
  BusinessCandidateStatus,
  BusinessCandidateVerificationStatus,
  Prisma,
  type BusinessCandidateSourceChannel,
} from "@prisma/client";
import { createHash } from "node:crypto";

import { prisma } from "@/lib/core/shared/prisma";
import type {
  BusinessCandidatePromotionExecutor,
  PersistBusinessPropositionsInput,
} from "./contracts";

// Live repro history: a 381-row spreadsheet import first failed with
// "Transaction API error: ... timeout for this transaction was 5000ms" —
// Prisma's interactive-transaction default — because every proposition's
// upsert ran sequentially inside one `$transaction`. Raising that timeout
// to 55000ms only moved the wall, it didn't remove it: the same 381-row
// import later failed again with "... timeout for this transaction was
// 55000 ms, however 55227 ms passed" — still one giant sequential
// transaction, just a bigger one. Each proposition is independent and
// already idempotency-keyed, so there's no correctness reason to wrap
// them in one shared transaction at all. Persisting them concurrently
// (bounded batches, each upsert its own statement) removes the ceiling
// entirely instead of raising it again.
const PERSIST_CONCURRENCY = 8;

export async function persistBusinessPropositions(
  input: PersistBusinessPropositionsInput,
) {
  assertPersistInput(input);

  const candidates = [];
  for (let start = 0; start < input.propositions.length; start += PERSIST_CONCURRENCY) {
    const batch = input.propositions.slice(start, start + PERSIST_CONCURRENCY);
    const results = await Promise.all(
      batch.map((proposition, offset) => persistOneProposition(input, proposition, start + offset)),
    );
    candidates.push(...results);
  }
  return candidates;
}

async function persistOneProposition(
  input: PersistBusinessPropositionsInput,
  proposition: PersistBusinessPropositionsInput["propositions"][number],
  index: number,
) {
  const idempotencyKey = candidateKey(input, index);
  return prisma.businessCandidate.upsert({
    where: {
      organizationId_idempotencyKey: {
        organizationId: input.organizationId,
        idempotencyKey,
      },
    },
    update: {},
    create: {
      propositionId: proposition.propositionId,
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      sourceChannel: input.sourceChannel,
      sourceMessageId: input.sourceMessageId,
      sourceEventId: input.sourceEventId,
      propositionType: proposition.propositionType,
      targetDomain: proposition.targetDomain,
      targetRecordId: proposition.targetRecordId,
      entityResolutionStatus: proposition.entityResolutionStatus,
      operation: proposition.operation,
      status: proposition.requiresApproval === false
        ? BusinessCandidateStatus.PROPOSED
        : BusinessCandidateStatus.PENDING_APPROVAL,
      confidence: proposition.confidence,
      provenanceJson: toJson(proposition.provenance),
      requiresApproval: proposition.requiresApproval ?? true,
      verificationRequired: proposition.verificationRequired ?? false,
      idempotencyKey,
      expiresAt: input.expiresAt,
      changes: {
        create: proposition.changes.map((change) => ({
          fieldPath: change.fieldPath,
          previousValue: toNullableJson(change.previousValue),
          proposedValue: toJson(change.proposedValue),
          verificationStatus: proposition.verificationRequired
            ? BusinessCandidateVerificationStatus.NEEDS_CONFIRMATION
            : BusinessCandidateVerificationStatus.UNVERIFIED,
          conflictStatus: proposition.entityResolutionStatus === "AMBIGUOUS"
            ? BusinessCandidateConflictStatus.AMBIGUOUS_TARGET
            : proposition.entityResolutionStatus === "NOT_FOUND"
              ? BusinessCandidateConflictStatus.TARGET_NOT_FOUND
              : BusinessCandidateConflictStatus.NONE,
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
    if (
      candidate.status === BusinessCandidateStatus.PROMOTING
      || candidate.status === BusinessCandidateStatus.PROMOTED
    ) {
      throw new Error("BUSINESS_CANDIDATE_DECISION_CLOSED");
    }

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
          verificationStatus: BusinessCandidateVerificationStatus.VERIFIED,
        },
      });
    }
    if (input.rejectedChangeIds.length > 0) {
      await tx.businessCandidateChange.updateMany({
        where: { candidateId: candidate.id, id: { in: [...input.rejectedChangeIds] } },
        data: {
          approvalStatus: BusinessCandidateApprovalStatus.REJECTED,
          verificationStatus: BusinessCandidateVerificationStatus.REJECTED,
        },
      });
    }

    const decidedChanges = await tx.businessCandidateChange.findMany({
      where: { candidateId: candidate.id },
    });
    const total = decidedChanges.length;
    const approved = decidedChanges.filter(
      (change) => change.approvalStatus === BusinessCandidateApprovalStatus.APPROVED,
    ).length;
    const rejected = decidedChanges.filter(
      (change) => change.approvalStatus === BusinessCandidateApprovalStatus.REJECTED,
    ).length;
    const status = approved === total
      ? BusinessCandidateStatus.APPROVED
      : rejected === total
        ? BusinessCandidateStatus.REJECTED
        : approved + rejected === total
          ? BusinessCandidateStatus.PARTIALLY_APPROVED
          : BusinessCandidateStatus.PENDING_APPROVAL;

    await tx.businessCandidate.update({
      where: { id: candidate.id },
      data: {
        status,
        ...(approved > 0 ? { approvedAt: new Date() } : {}),
        ...(rejected === total ? { rejectedAt: new Date() } : {}),
        ...(approved > 0 ? { verificationRequired: false } : {}),
      },
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
  if (candidate.verificationRequired) throw new Error("BUSINESS_CANDIDATE_VERIFICATION_REQUIRED");
  if (candidate.entityResolutionStatus !== "RESOLVED" && candidate.operation !== "CREATE") {
    throw new Error("BUSINESS_CANDIDATE_TARGET_UNRESOLVED");
  }
  const approved = candidate.changes.filter(
    (change) => change.approvalStatus === BusinessCandidateApprovalStatus.APPROVED,
  );
  if (approved.length === 0) throw new Error("BUSINESS_CANDIDATE_HAS_NO_APPROVED_CHANGES");

  const idempotencyKey = `business-candidate:${candidate.id}:promotion:v1`;
  const prior = candidate.promotionReceipts.find(
    (receipt) => receipt.idempotencyKey === idempotencyKey,
  );
  if (prior?.status === BusinessCandidatePromotionStatus.SUCCEEDED) return prior;

  await transitionCandidate(candidate.id, input.organizationId, candidate.status, BusinessCandidateStatus.PROMOTING);
  let execution;
  try {
    execution = await input.execute({
      candidateId: candidate.id,
      organizationId: input.organizationId,
      targetDomain: candidate.targetDomain,
      targetRecordId: candidate.targetRecordId,
      operation: candidate.operation,
      provenance: candidate.provenanceJson,
      approvedChanges: approved.map((change) => ({
        changeId: change.id,
        fieldPath: change.fieldPath,
        proposedValue: change.proposedValue,
        previousValue: change.previousValue,
      })),
      idempotencyKey,
    });
  } catch (error) {
    await recordPromotionFailure({
      organizationId: input.organizationId,
      candidateId: candidate.id,
      approvedChangeIds: approved.map((change) => change.id),
      targetDomain: candidate.targetDomain,
      targetRecordId: candidate.targetRecordId,
      actorUserId: input.actorUserId,
      systemAuthority: input.systemAuthority,
      idempotencyKey,
      errorCode: safeErrorCode(error),
    });
    throw error;
  }

  return prisma.$transaction(async (tx) => {
    const receipt = await tx.businessCandidatePromotionReceipt.upsert({
      where: {
        organizationId_idempotencyKey: {
          organizationId: input.organizationId,
          idempotencyKey,
        },
      },
      update: {
        approvedChangeIds: approved.map((change) => change.id),
        targetRecordId: execution.targetRecordId,
        canonicalOperation: execution.canonicalOperation,
        executionId: execution.executionId,
        actorUserId: input.actorUserId,
        systemAuthority: input.systemAuthority,
        status: execution.success
          ? BusinessCandidatePromotionStatus.SUCCEEDED
          : BusinessCandidatePromotionStatus.FAILED,
        errorCode: execution.errorCode,
        writtenAt: new Date(),
      },
      create: {
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
      data: {
        status: next,
        targetRecordId: execution.targetRecordId,
        ...(execution.success ? { promotedAt: new Date() } : {}),
      },
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
  await prisma.$transaction(async (tx) => {
    const transition = await tx.businessCandidate.updateMany({
      where: { id: candidateId, organizationId, status: fromStatus },
      data: { status: toStatus },
    });
    if (transition.count !== 1) throw new Error("BUSINESS_CANDIDATE_TRANSITION_CONFLICT");
    await tx.businessCandidateAudit.create({
      data: {
        organizationId,
        candidateId,
        fromStatus,
        toStatus,
        reasonCode: "PROMOTION_STARTED",
      },
    });
  });
}

export async function listBusinessCandidates(input: Readonly<{
  organizationId: string;
  status?: BusinessCandidateStatus;
  sourceMessageId?: string;
  sourceChannel?: BusinessCandidateSourceChannel;
  limit?: number;
}>) {
  return prisma.businessCandidate.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
      ...(input.sourceChannel ? { sourceChannel: input.sourceChannel } : {}),
    },
    include: { changes: true, promotionReceipts: true },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(input.limit ?? 50, 100)),
  });
}

export async function getBusinessCandidate(input: Readonly<{
  organizationId: string;
  candidateId: string;
}>) {
  return prisma.businessCandidate.findFirst({
    where: { id: input.candidateId, organizationId: input.organizationId },
    include: {
      changes: true,
      audits: { orderBy: { createdAt: "asc" } },
      promotionReceipts: true,
    },
  });
}

async function recordPromotionFailure(input: Readonly<{
  organizationId: string;
  candidateId: string;
  approvedChangeIds: readonly string[];
  targetDomain: string;
  targetRecordId: string | null;
  actorUserId?: string | null;
  systemAuthority?: string | null;
  idempotencyKey: string;
  errorCode: string;
}>): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.businessCandidatePromotionReceipt.upsert({
      where: {
        organizationId_idempotencyKey: {
          organizationId: input.organizationId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      update: {
        status: BusinessCandidatePromotionStatus.FAILED,
        errorCode: input.errorCode,
        writtenAt: new Date(),
      },
      create: {
        organizationId: input.organizationId,
        candidateId: input.candidateId,
        approvedChangeIds: [...input.approvedChangeIds],
        targetDomain: input.targetDomain,
        targetRecordId: input.targetRecordId ?? "UNRESOLVED",
        canonicalOperation: "NOT_EXECUTED",
        executionId: `not-executed:${input.candidateId}`,
        actorUserId: input.actorUserId,
        systemAuthority: input.systemAuthority,
        status: BusinessCandidatePromotionStatus.FAILED,
        errorCode: input.errorCode,
        idempotencyKey: input.idempotencyKey,
      },
    });
    await tx.businessCandidate.update({
      where: { id: input.candidateId },
      data: { status: BusinessCandidateStatus.FAILED },
    });
    await tx.businessCandidateAudit.create({
      data: {
        organizationId: input.organizationId,
        candidateId: input.candidateId,
        fromStatus: BusinessCandidateStatus.PROMOTING,
        toStatus: BusinessCandidateStatus.FAILED,
        actorUserId: input.actorUserId,
        reasonCode: "CANONICAL_PROMOTION_FAILED",
        metadataJson: { errorCode: input.errorCode },
      },
    });
  });
}

function safeErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return "UNKNOWN_PROMOTION_FAILURE";
  const code = error.message.replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 120);
  return code || "UNKNOWN_PROMOTION_FAILURE";
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
