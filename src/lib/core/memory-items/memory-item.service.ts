import {
  MemoryItemSource,
  MemoryItemStatus,
  type Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";

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

  return createApprovedItem({
    ...input,
    confidence: toConfidenceScore(input.confidence),
  });
}

export async function deleteMemoryItemForOrganization(input: {
  id: string;
  organizationId: string;
  deletedByUserId: string;
}): Promise<MemoryItemResult | null> {
  assertNonEmpty(input.id, "id");
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.deletedByUserId, "deletedByUserId");

  return markDeleted(input.id, input.organizationId, input.deletedByUserId);
}

export async function supersedeMemoryItemForOrganization(input: {
  id: string;
  organizationId: string;
}): Promise<MemoryItemResult | null> {
  assertNonEmpty(input.id, "id");
  assertNonEmpty(input.organizationId, "organizationId");

  return markSuperseded(input.id, input.organizationId);
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

    await markSuperseded(current.id, input.organizationId, tx);

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
        metadata: buildUpdateMetadata(current),
      },
      tx,
    );
  });
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
