import { Prisma } from "@prisma/client";
import type {
  ExecutiveDecisionOutcome,
  ExecutiveDecisionOutcomeType,
  ExecutiveDecisionRecord,
  ExecutiveDecisionRecordSourceType,
  ExecutiveDecisionRecordStatus,
} from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";
import type { KnowledgeAuthorityDecision } from "@/lib/executive-knowledge-authority";

import type { ExecutiveDecisionRecordCandidate } from "./executive-decision-loop.types";
import {
  assertExecutiveDecisionRecordTransitionAuthorization,
  type ExecutiveDecisionRecordTransitionAuthorization,
} from "./executive-decision-transition-authorization";

const OPEN_STATUSES: ExecutiveDecisionRecordStatus[] = ["PROPOSED", "COMMITTED"];

export async function upsertExecutiveDecisionRecord(
  input: ExecutiveDecisionRecordCandidate,
  authorityDecision: KnowledgeAuthorityDecision,
): Promise<ExecutiveDecisionRecord> {
  if (authorityDecision.canonicalOwner !== "DECISION_RECORD") {
    throw new Error("Knowledge Authority rejected Decision Record persistence.");
  }
  const existing = await prisma.executiveDecisionRecord.findUnique({
    where: {
      organizationId_decisionDate_sourceType_sourceKey: {
        organizationId: input.organizationId,
        decisionDate: input.decisionDate,
        sourceType: input.sourceType,
        sourceKey: input.sourceKey,
      },
    },
  });

  if (existing) return existing;

  return prisma.executiveDecisionRecord.create({
    data: {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      sourceType: input.sourceType,
      sourceKey: input.sourceKey,
      sourceSnapshotId: input.sourceSnapshotId,
      title: input.title,
      rationale: input.rationale,
      actionHint: input.actionHint,
      category: input.category,
      priority: input.priority,
      confidenceScore: input.confidenceScore,
      evidenceJson: toNullableJson(input.evidenceJson),
      sourcePayload: {
        ...input.sourcePayload,
        knowledgeAuthority: {
          producer: authorityDecision.signal.producer,
          epistemicType: authorityDecision.epistemicType,
          truthBoundary: authorityDecision.truthBoundary,
          canonicalOwner: authorityDecision.canonicalOwner,
          promotionPolicy: authorityDecision.promotionPolicy,
        },
      } as Prisma.InputJsonObject,
      decisionDate: input.decisionDate,
    },
  });
}

export async function listOpenExecutiveDecisionRecords(
  organizationId: string,
  take: number = 10,
): Promise<ExecutiveDecisionRecord[]> {
  return prisma.executiveDecisionRecord.findMany({
    where: {
      organizationId,
      status: { in: OPEN_STATUSES },
    },
    orderBy: [
      { status: "asc" },
      { decisionDate: "desc" },
      { createdAt: "desc" },
    ],
    take,
  });
}

export async function findRecentOpenExecutiveDecisionRecords(
  organizationId: string,
  take: number = 20,
): Promise<ExecutiveDecisionRecord[]> {
  return prisma.executiveDecisionRecord.findMany({
    where: {
      organizationId,
      status: { in: OPEN_STATUSES },
    },
    orderBy: [{ createdAt: "desc" }],
    take,
  });
}

export async function markExecutiveDecisionRecordCommitted(input: {
  id: string;
  conversationId: string;
  sourceMessageId: string;
  committedAt: Date;
  followUpDueAt: Date | null;
}, authorization: ExecutiveDecisionRecordTransitionAuthorization): Promise<ExecutiveDecisionRecord> {
  assertExecutiveDecisionRecordTransitionAuthorization(authorization, "COMMIT");
  assertDecisionTarget(input.id, authorization);
  const result = await prisma.executiveDecisionRecord.updateMany({
    where: {
      id: authorization.targetId,
      organizationId: authorization.organizationId,
      status: authorization.fromStatus,
    },
    data: {
      status: "COMMITTED",
      conversationId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
      committedAt: input.committedAt,
      followUpDueAt: input.followUpDueAt,
    },
  });
  return requireTransitionedDecision(result.count, authorization);
}

export async function markExecutiveDecisionRecordRejected(input: {
  id: string;
  sourceMessageId: string;
  closedAt: Date;
}, authorization: ExecutiveDecisionRecordTransitionAuthorization): Promise<ExecutiveDecisionRecord> {
  assertExecutiveDecisionRecordTransitionAuthorization(authorization, "REJECT");
  assertDecisionTarget(input.id, authorization);
  const result = await prisma.executiveDecisionRecord.updateMany({
    where: {
      id: authorization.targetId,
      organizationId: authorization.organizationId,
      status: authorization.fromStatus,
    },
    data: {
      status: "REJECTED",
      sourceMessageId: input.sourceMessageId,
      closedAt: input.closedAt,
    },
  });
  return requireTransitionedDecision(result.count, authorization);
}

export async function closeExecutiveDecisionRecord(input: {
  id: string;
  conversationId: string;
  sourceMessageId: string;
  closedAt: Date;
}, authorization: ExecutiveDecisionRecordTransitionAuthorization): Promise<ExecutiveDecisionRecord> {
  assertExecutiveDecisionRecordTransitionAuthorization(authorization, "CLOSE");
  assertDecisionTarget(input.id, authorization);
  const result = await prisma.executiveDecisionRecord.updateMany({
    where: {
      id: authorization.targetId,
      organizationId: authorization.organizationId,
      status: authorization.fromStatus,
    },
    data: {
      status: "CLOSED",
      conversationId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
      closedAt: input.closedAt,
    },
  });
  return requireTransitionedDecision(result.count, authorization);
}

export async function createExecutiveDecisionOutcomeIfMissing(input: {
  organizationId: string;
  decisionRecordId: string;
  conversationId: string;
  sourceMessageId: string;
  outcome: ExecutiveDecisionOutcomeType;
  summary: string | null;
  evidenceJson: object | null;
  occurredAt: Date;
}, authorityDecision: KnowledgeAuthorityDecision): Promise<ExecutiveDecisionOutcome> {
  if (authorityDecision.canonicalOwner !== "DECISION_RECORD") {
    throw new Error("Knowledge Authority rejected Decision Outcome persistence.");
  }
  const existing = await prisma.executiveDecisionOutcome.findFirst({
    where: {
      organizationId: input.organizationId,
      decisionRecordId: input.decisionRecordId,
      outcome: input.outcome,
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) return existing;

  return prisma.executiveDecisionOutcome.create({
    data: {
      organizationId: input.organizationId,
      decisionRecordId: input.decisionRecordId,
      conversationId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
      outcome: input.outcome,
      summary: input.summary,
      evidenceJson: toNullableJson(input.evidenceJson),
      occurredAt: input.occurredAt,
    },
  });
}

export async function listExecutiveDecisionContextRecords(
  organizationId: string,
): Promise<ExecutiveDecisionRecord[]> {
  return prisma.executiveDecisionRecord.findMany({
    where: {
      organizationId,
      status: { in: OPEN_STATUSES },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 20,
  });
}

export async function findLatestExecutiveDecisionOutcome(
  organizationId: string,
): Promise<(ExecutiveDecisionOutcome & { decisionRecord: ExecutiveDecisionRecord }) | null> {
  return prisma.executiveDecisionOutcome.findFirst({
    where: { organizationId },
    include: { decisionRecord: true },
    orderBy: { occurredAt: "desc" },
  });
}

export function buildDecisionSourceKey(
  sourceType: ExecutiveDecisionRecordSourceType,
  key: string,
): string {
  return `${sourceType.toLowerCase()}:${normalizeSourceKey(key)}`;
}

function normalizeSourceKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "_").slice(0, 120);
}

function toNullableJson(value: object | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonObject);
}

function assertDecisionTarget(
  inputId: string,
  authorization: ExecutiveDecisionRecordTransitionAuthorization,
): void {
  if (inputId !== authorization.targetId) {
    throw new Error("ExecutiveDecisionRecord transition target mismatch.");
  }
}

async function requireTransitionedDecision(
  count: number,
  authorization: ExecutiveDecisionRecordTransitionAuthorization,
): Promise<ExecutiveDecisionRecord> {
  if (count !== 1) {
    throw new Error("ExecutiveDecisionRecord transition rejected by current state.");
  }
  const decision = await prisma.executiveDecisionRecord.findFirst({
    where: { id: authorization.targetId, organizationId: authorization.organizationId },
  });
  if (!decision) throw new Error("ExecutiveDecisionRecord not found after transition.");
  return decision;
}
