import {
  MemoryCandidateStatus,
  MemoryItemSource,
  MemoryItemType,
  MemorySubjectType,
  type Prisma,
} from "@prisma/client";

import {
  createMemoryCandidate,
  listPendingMemoryCandidatesByOrganization,
} from "@/lib/core/memory-candidates/memory-candidate.service";
import { createApprovedItem } from "@/lib/core/memory-items/memory-item.repository";
import { listActiveMemoryItemsByOrganization } from "@/lib/core/memory-items/memory-item.service";
import { prisma } from "@/lib/core/shared/prisma";
import { markApproved } from "@/lib/core/memory-candidates/memory-candidate.repository";
import { authorizeMemoryCandidateTransition } from "@/lib/core/memory-candidates/memory-candidate-transition-authorization";
import { evaluateMemoryUpdateDecisions } from "@/lib/memory/memory-update-engine.service";
import {
  buildKnowledgeAuthorityMetadata,
  evaluateKnowledgeSignal,
} from "@/lib/executive-knowledge-authority";

import type { MemoryItemResult } from "@/lib/core/memory-items/memory-item.types";
import type {
  BuildOnboardingMemoryCandidatesInput,
  CreateDeterministicUpdateCandidatesInput,
  CreateDeterministicUpdateCandidatesResult,
  CreateMissingMemoryCandidatesInput,
  CreateMissingMemoryCandidatesResult,
  MemoryCandidateDescriptor,
} from "./candidate-engine.types";
import type { MemoryUpdateDecision } from "./memory-update-engine.types";

export function buildOnboardingMemoryCandidates(
  input: BuildOnboardingMemoryCandidatesInput,
): MemoryCandidateDescriptor[] {
  const answers = input.businessProfile.answers;
  const candidates = compactCandidates([
    buildCandidate({
      key: "industry",
      value: answers.industry,
      type: MemoryItemType.FACT,
      source: MemoryItemSource.ONBOARDING,
      confidence: 0.95,
      isAssumption: false,
      reason: "Kullanici onboarding sirasinda sektor bilgisini verdi.",
    }),
    buildCandidate({
      key: "team_size",
      value: answers.teamSize,
      type: MemoryItemType.FACT,
      source: MemoryItemSource.ONBOARDING,
      confidence: 0.95,
      isAssumption: false,
      reason: "Kullanici onboarding sirasinda ekip buyuklugunu verdi.",
    }),
    buildCandidate({
      key: "team_structure",
      value: answers.teamStructure,
      type: MemoryItemType.FACT,
      source: MemoryItemSource.ONBOARDING,
      confidence: 0.95,
      isAssumption: false,
      reason: "Kullanici onboarding sirasinda ekip yapisini verdi.",
    }),
    buildCandidate({
      key: "main_challenge",
      value: answers.mainChallenge,
      type: MemoryItemType.PROCESS,
      source: MemoryItemSource.ONBOARDING,
      confidence: 0.9,
      isAssumption: false,
      reason: "Kullanici onboarding sirasinda ana zorlandigi konuyu verdi.",
    }),
    buildCandidate({
      key: "first_goal",
      value: answers.firstGoal,
      type: MemoryItemType.STRATEGIC,
      source: MemoryItemSource.ONBOARDING,
      confidence: 0.9,
      isAssumption: false,
      reason: "Kullanici onboarding sirasinda ilk hedefini verdi.",
    }),
    buildCandidate({
      key: "main_bottleneck",
      value: input.recognitionProfile.insight.mainBottleneck,
      type: MemoryItemType.PROCESS,
      source: MemoryItemSource.SYSTEM_INFERRED,
      confidence: 0.6,
      isAssumption: true,
      reason: "Recognition sistemi onboarding cevaplarindan ana darbogaz adayi cikardi.",
    }),
    buildCandidate({
      key: "recommended_first_module",
      value: input.recognitionProfile.insight.recommendedFirstModule,
      type: MemoryItemType.PROCESS,
      source: MemoryItemSource.SYSTEM_INFERRED,
      confidence: 0.6,
      isAssumption: true,
      reason: "Recognition sistemi onboarding cevaplarindan onerilen ilk modul adayi cikardi.",
    }),
  ]);

  return uniqueDescriptors(candidates);
}

export async function createMissingMemoryCandidates(
  input: CreateMissingMemoryCandidatesInput,
): Promise<CreateMissingMemoryCandidatesResult> {
  const [pendingCandidates, activeMemoryItems] = await Promise.all([
    listPendingMemoryCandidatesByOrganization(input.organizationId),
    listActiveMemoryItemsByOrganization(input.organizationId),
  ]);
  const existingKeys = new Set<string>();

  for (const candidate of pendingCandidates) {
    existingKeys.add(
      buildDuplicateKey({
        type: candidate.proposedType,
        key: candidate.proposedKey,
        value: candidate.proposedValue,
      }),
    );
  }

  for (const memoryItem of activeMemoryItems) {
    existingKeys.add(
      buildDuplicateKey({
        type: memoryItem.type,
        key: memoryItem.key,
        value: memoryItem.value,
      }),
    );
  }

  const created: CreateMissingMemoryCandidatesResult["created"] = [];
  const skipped: CreateMissingMemoryCandidatesResult["skipped"] = [];

  for (const candidate of input.candidates) {
    const authorityDecision = candidate.authorityDecision ?? evaluateKnowledgeSignal({
      producer: toKnowledgeProducer(candidate.source),
      key: candidate.proposedKey,
      value: candidate.proposedValue,
      memoryItemType: candidate.proposedType,
      memorySource: candidate.source,
      userConfirmed: !candidate.isAssumption,
      isAssumption: candidate.isAssumption,
      durable: true,
      requiresHumanApproval: candidate.source !== MemoryItemSource.ONBOARDING || candidate.isAssumption,
      candidatePersistence: true,
      confidence: candidate.confidence,
    });

    if (authorityDecision.canonicalOwner === "DISCARD") {
      skipped.push(candidate);
      continue;
    }
    const duplicateKey = buildDuplicateKey({
      type: candidate.proposedType,
      key: candidate.proposedKey,
      value: candidate.proposedValue,
    });

    if (existingKeys.has(duplicateKey)) {
      skipped.push(candidate);
      continue;
    }

    const createdCandidate = await createMemoryCandidate({
      organizationId: input.organizationId,
      createdByUserId: input.createdByUserId,
      subjectType: candidate.subjectType,
      subjectId: candidate.subjectId,
      proposedType: candidate.proposedType,
      proposedKey: candidate.proposedKey,
      proposedValue: candidate.proposedValue,
      source: candidate.source,
      confidence: candidate.confidence,
      isAssumption: candidate.isAssumption,
      reason: candidate.reason,
      evidenceJson: candidate.evidenceJson,
      metadata: mergeAuthorityMetadata(
        candidate.metadata,
        buildKnowledgeAuthorityMetadata(authorityDecision),
      ) as Prisma.InputJsonObject,
      sourceMessageId: candidate.sourceMessageId,
    }, authorityDecision);

    created.push(createdCandidate);
    existingKeys.add(duplicateKey);
  }

  return {
    created,
    skipped,
  };
}

export async function activateOnboardingMemoryCandidates(input: {
  organizationId: string;
  systemUserId?: string | null;
}): Promise<{ activatedCount: number; skippedCount: number }> {
  const pendingCandidates = await listPendingMemoryCandidatesByOrganization(
    input.organizationId,
  );

  const onboardingCandidates = pendingCandidates.filter(
    (c) =>
      c.source === MemoryItemSource.ONBOARDING ||
      c.source === MemoryItemSource.SYSTEM_INFERRED,
  );

  if (onboardingCandidates.length === 0) {
    return { activatedCount: 0, skippedCount: 0 };
  }

  const activeMemoryItems = await listActiveMemoryItemsByOrganization(
    input.organizationId,
  );
  const existingKeys = new Set(
    activeMemoryItems.map((item) =>
      buildDuplicateKey({ type: item.type, key: item.key, value: item.value }),
    ),
  );

  let activatedCount = 0;
  let skippedCount = 0;

  for (const candidate of onboardingCandidates) {
    const authorityDecision = evaluateKnowledgeSignal({
      producer: candidate.source === MemoryItemSource.ONBOARDING ? "ONBOARDING" : "RECOGNITION_RESULT",
      key: candidate.proposedKey,
      value: candidate.proposedValue,
      memoryItemType: candidate.proposedType,
      memorySource: candidate.source,
      userConfirmed: !candidate.isAssumption,
      isAssumption: candidate.isAssumption,
      durable: true,
      requiresHumanApproval: candidate.source !== MemoryItemSource.ONBOARDING || candidate.isAssumption,
      candidatePersistence: true,
      confidence: candidate.confidence,
    });

    if (
      authorityDecision.canonicalOwner !== "MEMORY_CANDIDATE" ||
      authorityDecision.promotionPolicy !== "AUTOMATIC"
    ) {
      skippedCount++;
      continue;
    }
    const duplicateKey = buildDuplicateKey({
      type: candidate.proposedType,
      key: candidate.proposedKey,
      value: candidate.proposedValue,
    });

    if (existingKeys.has(duplicateKey)) {
      skippedCount++;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const approvedCandidate = await markApproved(
          authorizeMemoryCandidateTransition({
            transition: "APPROVE",
            organizationId: input.organizationId,
            targetId: candidate.id,
            actorUserId: input.systemUserId,
            sourceService: "candidate-engine.activateOnboardingMemoryCandidates",
          }),
          tx,
        );
        if (!approvedCandidate || approvedCandidate.status !== MemoryCandidateStatus.APPROVED) {
          throw new Error("Onboarding candidate is no longer pending.");
        }

        const memoryAuthorityDecision = evaluateKnowledgeSignal({
          producer: "ONBOARDING",
          key: candidate.proposedKey,
          value: candidate.proposedValue,
          memoryItemType: candidate.proposedType,
          memorySource: MemoryItemSource.ONBOARDING,
          userConfirmed: true,
          durable: true,
        });

        await createApprovedItem(
          {
            organizationId: input.organizationId,
            createdByUserId: input.systemUserId,
            subjectType: candidate.subjectType,
            subjectId: candidate.subjectId,
            type: candidate.proposedType,
            key: candidate.proposedKey,
            value: candidate.proposedValue,
            source: MemoryItemSource.ONBOARDING,
            confidence: candidate.confidence,
            isUserConfirmed: !candidate.isAssumption,
            sourceCandidateId: candidate.id,
            metadata: {
              activatedByOnboarding: true,
              originalCandidateSource: candidate.source,
              candidateAuthority: buildKnowledgeAuthorityMetadata(authorityDecision),
              ...buildKnowledgeAuthorityMetadata(memoryAuthorityDecision),
            },
          },
          memoryAuthorityDecision,
          tx,
        );
      });

      existingKeys.add(duplicateKey);
      activatedCount++;
    } catch {
      skippedCount++;
    }
  }

  return { activatedCount, skippedCount };
}

export async function createDeterministicUpdateCandidates(
  input: CreateDeterministicUpdateCandidatesInput,
): Promise<CreateDeterministicUpdateCandidatesResult> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.createdByUserId, "createdByUserId");
  assertNonEmpty(input.sourceMessageId, "sourceMessageId");
  assertNonEmpty(input.message, "message");

  const activeMemoryItems =
    input.activeMemoryItems ??
    (await listActiveMemoryItemsByOrganization(input.organizationId));
  const descriptors = buildDeterministicUpdateDescriptors({
    activeMemoryItems,
    message: input.message,
    sourceMessageId: input.sourceMessageId,
  });

  return createMissingMemoryCandidates({
    organizationId: input.organizationId,
    createdByUserId: input.createdByUserId,
    candidates: descriptors,
  });
}

function buildDeterministicUpdateDescriptors(input: {
  activeMemoryItems: MemoryItemResult[];
  message: string;
  sourceMessageId: string;
}): MemoryCandidateDescriptor[] {
  return evaluateMemoryUpdateDecisions({
    activeMemoryItems: input.activeMemoryItems,
    message: input.message,
  })
    .filter(isCandidateBackedDecision)
    .map((decision) =>
      buildDescriptorFromUpdateDecision({
        decision,
        sourceMessageId: input.sourceMessageId,
      }),
    );
}

function buildCandidate(input: {
  key: string;
  value: string | undefined;
  type: MemoryItemType;
  source: MemoryItemSource;
  confidence: number;
  isAssumption: boolean;
  reason: string;
}): MemoryCandidateDescriptor | null {
  const value = input.value?.trim();

  if (!value) {
    return null;
  }

  return {
    subjectType: MemorySubjectType.ORGANIZATION,
    proposedType: input.type,
    proposedKey: input.key,
    proposedValue: value,
    source: input.source,
    confidence: input.confidence,
    isAssumption: input.isAssumption,
    reason: input.reason,
  };
}

function compactCandidates(
  candidates: Array<MemoryCandidateDescriptor | null>,
): MemoryCandidateDescriptor[] {
  return candidates.filter(
    (candidate): candidate is MemoryCandidateDescriptor => candidate !== null,
  );
}

function uniqueDescriptors(
  candidates: MemoryCandidateDescriptor[],
): MemoryCandidateDescriptor[] {
  const seen = new Set<string>();
  const uniqueCandidates: MemoryCandidateDescriptor[] = [];

  for (const candidate of candidates) {
    const duplicateKey = buildDuplicateKey({
      type: candidate.proposedType,
      key: candidate.proposedKey,
      value: candidate.proposedValue,
    });

    if (seen.has(duplicateKey)) {
      continue;
    }

    seen.add(duplicateKey);
    uniqueCandidates.push(candidate);
  }

  return uniqueCandidates;
}

function buildDuplicateKey(input: {
  type: MemoryItemType;
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

function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }
}

function toKnowledgeProducer(source: MemoryItemSource): string {
  switch (source) {
    case MemoryItemSource.ONBOARDING:
      return "ONBOARDING";
    case MemoryItemSource.USER_CORRECTION:
      return "USER_CORRECTION";
    case MemoryItemSource.USER_PROVIDED:
      return "USER_STATEMENT";
    case MemoryItemSource.EVENT_DERIVED:
      return "SYSTEM_EVENT";
    case MemoryItemSource.SYSTEM_INFERRED:
      return "RECOGNITION_RESULT";
    default:
      return "METADATA_REUSE";
  }
}

function mergeAuthorityMetadata(
  existing: unknown,
  authority: Record<string, unknown>,
): Record<string, unknown> {
  const base = existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing as Record<string, unknown>
    : {};
  return { ...base, ...authority };
}

function isCandidateBackedDecision(
  decision: MemoryUpdateDecision,
): decision is MemoryUpdateDecision & { memoryItem: MemoryItemResult } {
  return (
    decision.kind === "UPDATE_EXISTING" &&
    decision.requiresApproval &&
    decision.memoryItem !== undefined
  );
}

function buildDescriptorFromUpdateDecision(input: {
  decision: MemoryUpdateDecision & { memoryItem: MemoryItemResult };
  sourceMessageId: string;
}): MemoryCandidateDescriptor {
  const { decision } = input;

  return {
    subjectType: decision.memoryItem.subjectType,
    subjectId: decision.memoryItem.subjectId,
    proposedType: decision.proposedType,
    proposedKey: decision.proposedKey,
    proposedValue: decision.proposedValue,
    source: MemoryItemSource.USER_PROVIDED,
    confidence: decision.confidence,
    isAssumption: false,
    reason: decision.reason,
    evidenceJson: {
      decisionKind: decision.kind,
      sourceMessageId: input.sourceMessageId,
      ...decision.evidence,
    },
    metadata: {
      intent: "memory_update",
      supersedesMemoryId: decision.supersedesMemoryId,
      previousValue: decision.previousValue,
      proposedValue: decision.proposedValue,
      updateKey: decision.proposedKey,
      updateRule: decision.ruleId,
      decisionKind: decision.kind,
    },
    sourceMessageId: input.sourceMessageId,
  };
}
