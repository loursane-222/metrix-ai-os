import { evaluateKnowledgeSignal } from "@/lib/executive-knowledge-authority";
import type { KnowledgeAuthorityDecision } from "@/lib/executive-knowledge-authority";
import type { ExecutiveLearningLoop } from "./learning-loop.types";
import { MemoryItemSource, MemoryItemType, MemorySubjectType } from "@prisma/client";
import type { CreateMissingMemoryCandidatesResult } from "@/lib/memory/candidate-engine.types";

export function authorizeEosLearning(
  learning: ExecutiveLearningLoop,
): KnowledgeAuthorityDecision[] {
  if (!learning.shouldLearn) return [];

  return learning.candidates.map((candidate) =>
    evaluateKnowledgeSignal({
      producer: "EOS_LEARNING",
      key: candidate.key,
      value: candidate.proposedValue,
      epistemicType: candidate.trigger === "outcome_reported" ? "SIGNAL" : "INFERENCE",
      verified: false,
      userConfirmed: false,
      isAssumption: true,
      durable: true,
      confidence: candidate.signalStrength === "strong" ? 0.8 : candidate.signalStrength === "moderate" ? 0.6 : 0.4,
      metadata: { trigger: candidate.trigger, rationale: candidate.rationale },
    }),
  );
}

export async function persistAuthorizedEosLearning(input: {
  organizationId: string;
  createdByUserId?: string | null;
  learning: ExecutiveLearningLoop;
}): Promise<CreateMissingMemoryCandidatesResult> {
  const { createMissingMemoryCandidates } = await import("@/lib/memory/candidate-engine.service");
  const decisions = authorizeEosLearning(input.learning);
  const candidates = decisions
    .filter(
      (decision) =>
        decision.canonicalOwner === "MEMORY_CANDIDATE" &&
        decision.promotionPolicy === "HUMAN_APPROVAL",
    )
    .map((decision) => ({
      subjectType: MemorySubjectType.ORGANIZATION,
      proposedType: toMemoryItemType(decision.epistemicType),
      proposedKey: decision.signal.key,
      proposedValue: decision.signal.value,
      source: MemoryItemSource.SYSTEM_INFERRED,
      confidence: decision.signal.confidence ?? 0.5,
      isAssumption: true,
      reason: readRationale(decision.signal.metadata),
      evidenceJson: {
        producer: "EOS_LEARNING",
        epistemicType: decision.epistemicType,
        truthBoundary: decision.truthBoundary,
      },
      metadata: {
        eosLearning: true,
        trigger: readMetadataString(decision.signal.metadata, "trigger"),
        rationale: readRationale(decision.signal.metadata),
      },
      authorityDecision: decision,
    }));

  return createMissingMemoryCandidates({
    organizationId: input.organizationId,
    createdByUserId: input.createdByUserId,
    candidates,
  });
}

function toMemoryItemType(epistemicType: KnowledgeAuthorityDecision["epistemicType"]): MemoryItemType {
  if (epistemicType === "PREFERENCE") return MemoryItemType.PREFERENCE;
  if (epistemicType === "PROCESS") return MemoryItemType.PROCESS;
  if (epistemicType === "STRATEGIC") return MemoryItemType.STRATEGIC;
  return MemoryItemType.FACT;
}

function readRationale(metadata: Readonly<Record<string, unknown>> | undefined): string {
  const rationale = metadata?.rationale;
  return typeof rationale === "string" && rationale.trim()
    ? rationale
    : "EOS learning signal requires human approval.";
}

function readMetadataString(
  metadata: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "unknown";
}
