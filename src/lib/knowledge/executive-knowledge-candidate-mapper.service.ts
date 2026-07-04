// ─── Executive Knowledge Candidate Mapper V1 ──────────────────────────────────
//
// KnowledgeDetectionResult[] → MemoryCandidateDescriptor[]
// Duplicate kontrolü Candidate Engine'e bırakılmıştır.

import {
  MemoryItemSource,
  MemoryItemType,
  MemorySubjectType,
} from "@prisma/client";

import { getKnowledgeKey } from "./executive-knowledge-registry";
import type {
  KnowledgeMemoryType,
  KnowledgeSubjectType,
} from "./executive-knowledge-registry.types";
import type { MemoryCandidateDescriptor } from "@/lib/memory/candidate-engine.types";
import type { KnowledgeCandidateMappingInput } from "./executive-knowledge-acquisition-engine.types";

export function mapKnowledgeDetectionsToMemoryCandidates(
  input: KnowledgeCandidateMappingInput,
): MemoryCandidateDescriptor[] {
  const result: MemoryCandidateDescriptor[] = [];

  for (const detection of input.detections) {
    const entry = getKnowledgeKey(detection.canonicalKey);
    if (!entry) continue;

    result.push({
      subjectType: toMemorySubjectType(entry.subjectType),
      proposedType: toMemoryItemType(entry.memoryType),
      proposedKey: entry.key,
      proposedValue: detection.detectedValue,
      source: MemoryItemSource.USER_PROVIDED,
      confidence: detection.confidence,
      isAssumption: detection.isAssumption,
      reason: `Sohbetten tespit edildi: ${entry.label}`,
      sourceMessageId: input.sourceMessageId,
      evidenceJson: {
        knowledgeLevel: detection.knowledgeLevel,
        resolvedFromAlias: detection.resolvedFromAlias,
        acquisitionBasis: "EXPLICIT",
      },
    });
  }

  return result;
}

function toMemoryItemType(type: KnowledgeMemoryType): MemoryItemType {
  switch (type) {
    case "FACT":       return MemoryItemType.FACT;
    case "PREFERENCE": return MemoryItemType.PREFERENCE;
    case "PROCESS":    return MemoryItemType.PROCESS;
    case "STRATEGIC":  return MemoryItemType.STRATEGIC;
  }
}

function toMemorySubjectType(type: KnowledgeSubjectType): MemorySubjectType {
  switch (type) {
    case "ORGANIZATION": return MemorySubjectType.ORGANIZATION;
    case "USER":         return MemorySubjectType.USER;
    case "PROCESS":      return MemorySubjectType.PROCESS;
    case "STRATEGY":     return MemorySubjectType.STRATEGY;
  }
}
