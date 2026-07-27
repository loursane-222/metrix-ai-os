import {
  BusinessCandidateOperation,
  BusinessCandidateSourceChannel,
} from "@prisma/client";

import type {
  CanonicalCaptureEnvelope,
  TrustedCaptureContext,
  UniversalCaptureResult,
} from "@/lib/universal-capture/contracts";
import { persistBusinessPropositions } from "./business-candidate.service";

/**
 * Persistence adapter kept outside Universal Capture's pure core boundary.
 */
export async function persistUniversalCaptureCandidates(input: Readonly<{
  context: TrustedCaptureContext;
  envelope: CanonicalCaptureEnvelope;
  result: UniversalCaptureResult;
  channel: BusinessCandidateSourceChannel;
  sourceMessageId?: string | null;
}>) {
  if (input.envelope.source.category === "AI_GENERATED") return [];
  if (input.result.status === "REJECTED" || input.result.resolvedCandidates.length === 0) {
    return [];
  }

  const groups = new Map<string, typeof input.result.resolvedCandidates>();
  for (const candidate of input.result.resolvedCandidates) {
    const key = candidate.entityRef
      ? `${candidate.entityRef.entityType}:${candidate.entityRef.entityId}`
      : `${input.result.entityResolution.entityType}:NEW`;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  return persistBusinessPropositions({
    organizationId: input.context.organizationId,
    conversationId: input.envelope.conversationRef,
    sourceChannel: input.channel,
    sourceMessageId: input.sourceMessageId,
    sourceInputId: input.envelope.captureId,
    propositions: [...groups.values()].map((candidates) => {
      const reference = candidates[0]?.entityRef;
      return {
        propositionType: `${input.envelope.requestedOperation}_${input.result.entityResolution.entityType}`,
        targetDomain: reference?.entityType ?? input.result.entityResolution.entityType,
        targetRecordId: reference?.entityId ?? null,
        operation: BusinessCandidateOperation[input.envelope.requestedOperation],
        confidence: Math.min(...candidates.map((candidate) => candidate.confidence.score)),
        requiresApproval: true,
        provenance: {
          captureId: input.envelope.captureId,
          sourceId: input.envelope.source.id,
          sourceCategory: input.envelope.source.category,
          sourceAdapter: input.envelope.source.adapter,
          sourceAdapterVersion: input.envelope.source.version,
        },
        changes: candidates.map((candidate) => ({
          fieldPath: candidate.fieldId,
          proposedValue: candidate.normalizedValue,
          confidence: candidate.confidence.score,
          requiresApproval: true,
        })),
      };
    }),
  });
}
