import {
  MemoryItemSource,
  MemoryItemStatus,
  type Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";
import {
  buildKnowledgeAuthorityMetadata,
  evaluateKnowledgeSignal,
} from "@/lib/executive-knowledge-authority";

import {
  createApprovedItem,
  findByIdForOrganization,
  listActiveByOrganization,
  markDeleted,
  markSuperseded,
} from "./memory-item.repository";

import type {
  CreateApprovedMemoryItemInput,
  MemoryItemResult,
  UpdateMemoryItemForOrganizationInput,
} from "./memory-item.types";
import { authorizeMemoryItemTransition } from "./memory-item-transition-authorization";

export async function listActiveMemoryItemsByOrganization(
  organizationId: string,
): Promise<MemoryItemResult[]> {
  assertNonEmpty(organizationId, "organizationId");

  return listActiveByOrganization(organizationId);
}

export async function findMemoryItemByIdForOrganization(
  id: string,
  organizationId: string,
): Promise<MemoryItemResult | null> {
  assertNonEmpty(id, "id");
  assertNonEmpty(organizationId, "organizationId");

  return findByIdForOrganization(id, organizationId);
}

export async function createApprovedMemoryItem(
  input: CreateApprovedMemoryItemInput,
): Promise<MemoryItemResult> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.key, "key");
  assertNonEmpty(input.value, "value");
  assertNormalizedConfidence(input.confidence);

  const authorityDecision = evaluateKnowledgeSignal({
    producer: toKnowledgeProducer(input.source),
    key: input.key,
    value: input.value,
    memoryItemType: input.type,
    memorySource: input.source,
    userConfirmed: input.isUserConfirmed,
    verified: input.source === MemoryItemSource.EVENT_DERIVED,
    durable: true,
    confidence: input.confidence,
  });
  if (authorityDecision.canonicalOwner !== "MEMORY_ITEM") {
    throw new Error(`Knowledge Authority rejected direct MemoryItem ownership: ${authorityDecision.canonicalOwner}.`);
  }

  return createApprovedItem(
    {
      ...input,
      confidence: toConfidenceScore(input.confidence),
      metadata: mergeMetadata(input.metadata, buildKnowledgeAuthorityMetadata(authorityDecision)) as Prisma.InputJsonObject,
    },
    authorityDecision,
  );
}

export async function deleteMemoryItemForOrganization(input: {
  id: string;
  organizationId: string;
  deletedByUserId: string;
}): Promise<MemoryItemResult | null> {
  assertNonEmpty(input.id, "id");
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.deletedByUserId, "deletedByUserId");

  return markDeleted(authorizeMemoryItemTransition({
    transition: "DELETE",
    organizationId: input.organizationId,
    targetId: input.id,
    actorUserId: input.deletedByUserId,
    sourceService: "memory-item.service.deleteMemoryItemForOrganization",
  }));
}

export async function supersedeMemoryItemForOrganization(input: {
  id: string;
  organizationId: string;
}): Promise<MemoryItemResult | null> {
  assertNonEmpty(input.id, "id");
  assertNonEmpty(input.organizationId, "organizationId");

  return markSuperseded(authorizeMemoryItemTransition({
    transition: "SUPERSEDE",
    organizationId: input.organizationId,
    targetId: input.id,
    sourceService: "memory-item.service.supersedeMemoryItemForOrganization",
  }));
}

export async function updateMemoryItemForOrganization(
  input: UpdateMemoryItemForOrganizationInput,
): Promise<MemoryItemResult | null> {
  assertNonEmpty(input.id, "id");
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.updatedByUserId, "updatedByUserId");
  assertNonEmpty(input.value, "value");

  return prisma.$transaction(async (tx) => {
    const current = await findByIdForOrganization(
      input.id,
      input.organizationId,
      tx,
    );

    if (
      !current ||
      current.status !== MemoryItemStatus.ACTIVE ||
      current.deletedAt !== null
    ) {
      return null;
    }

    const nextValue = input.value.trim();

    if (normalizeValue(current.value) === normalizeValue(nextValue)) {
      return current;
    }

    const superseded = await markSuperseded(authorizeMemoryItemTransition({
      transition: "SUPERSEDE",
      organizationId: input.organizationId,
      targetId: current.id,
      actorUserId: input.updatedByUserId,
      sourceService: "memory-item.service.updateMemoryItemForOrganization",
    }), tx);
    if (!superseded || superseded.status !== MemoryItemStatus.SUPERSEDED) {
      return null;
    }

    const authorityDecision = evaluateKnowledgeSignal({
      producer: "USER_CORRECTION",
      key: current.key,
      value: nextValue,
      memoryItemType: current.type,
      memorySource: MemoryItemSource.USER_CORRECTION,
      userConfirmed: true,
      durable: true,
    });

    return createApprovedItem(
      {
        organizationId: input.organizationId,
        createdByUserId: input.updatedByUserId,
        subjectType: current.subjectType,
        subjectId: current.subjectId,
        type: current.type,
        key: current.key,
        value: nextValue,
        source: MemoryItemSource.USER_CORRECTION,
        confidence: 100,
        isUserConfirmed: true,
        sourceEventId: current.sourceEventId,
        sourceCandidateId: current.sourceCandidateId,
        supersedesMemoryId: current.id,
        metadata: {
          ...buildUpdateMetadata(current),
          ...buildKnowledgeAuthorityMetadata(authorityDecision),
        } as Prisma.InputJsonObject,
      },
      authorityDecision,
      tx,
    );
  });
}

function toKnowledgeProducer(source: MemoryItemSource): string {
  if (source === MemoryItemSource.USER_CORRECTION) return "USER_CORRECTION";
  if (source === MemoryItemSource.ONBOARDING) return "ONBOARDING";
  if (source === MemoryItemSource.EVENT_DERIVED) return "SYSTEM_EVENT";
  if (source === MemoryItemSource.SYSTEM_INFERRED) return "RECOGNITION_RESULT";
  if (source === MemoryItemSource.CANDIDATE_APPROVED) return "METADATA_REUSE";
  return "USER_STATEMENT";
}

function mergeMetadata(existing: unknown, authority: Record<string, unknown>): Record<string, unknown> {
  const base = existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing as Record<string, unknown>
    : {};
  return { ...base, ...authority };
}

function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }
}

function assertNormalizedConfidence(confidence: number | undefined): void {
  if (confidence === undefined) {
    return;
  }

  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("confidence must be between 0 and 1.");
  }
}

function toConfidenceScore(confidence: number | undefined): number | undefined {
  return confidence === undefined ? undefined : Math.round(confidence * 100);
}

function normalizeValue(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}

function buildUpdateMetadata(current: MemoryItemResult): Prisma.InputJsonObject {
  return {
    updatedFromMemoryItemId: current.id,
    previousValue: current.value,
    updateSource: "manual_memory_card",
  };
}
