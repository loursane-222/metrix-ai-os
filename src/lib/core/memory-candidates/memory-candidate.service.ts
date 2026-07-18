import {
  createCandidate,
  findByIdForOrganization,
  listPendingByOrganization,
  markApproved,
  markDismissed,
  markExpired,
  markRejected,
} from "./memory-candidate.repository";

import type {
  CreateMemoryCandidateInput,
  MemoryCandidateResult,
} from "./memory-candidate.types";
import type { KnowledgeAuthorityDecision } from "@/lib/executive-knowledge-authority";
import { authorizeMemoryCandidateTransition } from "./memory-candidate-transition-authorization";

export async function createMemoryCandidate(
  input: CreateMemoryCandidateInput,
  authorityDecision: KnowledgeAuthorityDecision,
): Promise<MemoryCandidateResult> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.proposedKey, "proposedKey");
  assertNonEmpty(input.proposedValue, "proposedValue");
  assertNonEmpty(input.reason, "reason");
  assertNormalizedConfidence(input.confidence);

  return createCandidate({
    ...input,
    confidence: toConfidenceScore(input.confidence),
  }, authorityDecision);
}

export async function listPendingMemoryCandidatesByOrganization(
  organizationId: string,
): Promise<MemoryCandidateResult[]> {
  assertNonEmpty(organizationId, "organizationId");

  return listPendingByOrganization(organizationId);
}

export async function findMemoryCandidateByIdForOrganization(
  id: string,
  organizationId: string,
): Promise<MemoryCandidateResult | null> {
  assertNonEmpty(id, "id");
  assertNonEmpty(organizationId, "organizationId");

  return findByIdForOrganization(id, organizationId);
}

export async function approveMemoryCandidate(input: {
  id: string;
  organizationId: string;
  reviewedByUserId: string;
}): Promise<MemoryCandidateResult | null> {
  assertReviewInput(input);

  return markApproved(authorizeMemoryCandidateTransition({
    transition: "APPROVE",
    organizationId: input.organizationId,
    targetId: input.id,
    actorUserId: input.reviewedByUserId,
    sourceService: "memory-candidate.service.approveMemoryCandidate",
  }));
}

export async function rejectMemoryCandidate(input: {
  id: string;
  organizationId: string;
  reviewedByUserId: string;
  reason?: string;
}): Promise<MemoryCandidateResult | null> {
  assertReviewInput(input);
  assertOptionalReason(input.reason);

  return markRejected(authorizeMemoryCandidateTransition({
    transition: "REJECT",
    organizationId: input.organizationId,
    targetId: input.id,
    actorUserId: input.reviewedByUserId,
    sourceService: "memory-candidate.service.rejectMemoryCandidate",
  }));
}

export async function dismissMemoryCandidate(input: {
  id: string;
  organizationId: string;
  reviewedByUserId: string;
  reason?: string;
}): Promise<MemoryCandidateResult | null> {
  assertReviewInput(input);
  assertOptionalReason(input.reason);

  return markDismissed(authorizeMemoryCandidateTransition({
    transition: "DISMISS",
    organizationId: input.organizationId,
    targetId: input.id,
    actorUserId: input.reviewedByUserId,
    sourceService: "memory-candidate.service.dismissMemoryCandidate",
  }));
}

export async function expireMemoryCandidate(input: {
  id: string;
  organizationId: string;
}): Promise<MemoryCandidateResult | null> {
  assertNonEmpty(input.id, "id");
  assertNonEmpty(input.organizationId, "organizationId");

  return markExpired(authorizeMemoryCandidateTransition({
    transition: "EXPIRE",
    organizationId: input.organizationId,
    targetId: input.id,
    sourceService: "memory-candidate.service.expireMemoryCandidate",
  }));
}

function assertReviewInput(input: {
  id: string;
  organizationId: string;
  reviewedByUserId: string;
}): void {
  assertNonEmpty(input.id, "id");
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.reviewedByUserId, "reviewedByUserId");
}

function assertOptionalReason(reason: string | undefined): void {
  if (reason !== undefined) {
    assertNonEmpty(reason, "reason");
  }
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
