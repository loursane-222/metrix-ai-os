import { Prisma } from "@prisma/client";
import type {
  ExecutiveDecisionOutcome,
  ExecutiveDecisionOutcomeType,
  ExecutiveDecisionRecord,
  ExecutiveDecisionRecordSourceType,
  ExecutiveDecisionRecordStatus,
} from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";

import type { ExecutiveDecisionRecordCandidate } from "./executive-decision-loop.types";

const OPEN_STATUSES: ExecutiveDecisionRecordStatus[] = ["PROPOSED", "COMMITTED"];

export async function upsertExecutiveDecisionRecord(
  input: ExecutiveDecisionRecordCandidate,
): Promise<ExecutiveDecisionRecord> {
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
      sourcePayload: input.sourcePayload as Prisma.InputJsonObject,
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
}): Promise<ExecutiveDecisionRecord> {
  return prisma.executiveDecisionRecord.update({
    where: { id: input.id },
    data: {
      status: "COMMITTED",
      conversationId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
      committedAt: input.committedAt,
      followUpDueAt: input.followUpDueAt,
    },
  });
}

export async function closeExecutiveDecisionRecord(input: {
  id: string;
  conversationId: string;
  sourceMessageId: string;
  closedAt: Date;
}): Promise<ExecutiveDecisionRecord> {
  return prisma.executiveDecisionRecord.update({
    where: { id: input.id },
    data: {
      status: "CLOSED",
      conversationId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
      closedAt: input.closedAt,
    },
  });
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
}): Promise<ExecutiveDecisionOutcome> {
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
