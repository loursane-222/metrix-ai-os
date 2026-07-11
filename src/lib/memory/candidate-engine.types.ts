import type {
  MemoryCandidate,
  MemoryItemSource,
  MemoryItemType,
  MemorySubjectType,
  Prisma,
} from "@prisma/client";

import type {
  BusinessProfileJson,
  RecognitionProfileJson,
} from "@/lib/recognition/recognition-engine.types";
import type { MemoryItemResult } from "@/lib/core/memory-items/memory-item.types";

export type MemoryCandidateDescriptor = {
  subjectType: MemorySubjectType;
  subjectId?: string | null;
  proposedType: MemoryItemType;
  proposedKey: string;
  proposedValue: string;
  source: MemoryItemSource;
  confidence: number;
  isAssumption: boolean;
  reason: string;
  evidenceJson?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  sourceMessageId?: string | null;
};

export type BuildOnboardingMemoryCandidatesInput = {
  businessProfile: BusinessProfileJson;
  recognitionProfile: RecognitionProfileJson;
};

export type CreateMissingMemoryCandidatesInput = {
  organizationId: string;
  createdByUserId?: string | null;
  candidates: MemoryCandidateDescriptor[];
};

export type CreateMissingMemoryCandidatesResult = {
  created: MemoryCandidate[];
  skipped: MemoryCandidateDescriptor[];
};

export type CreateDeterministicUpdateCandidatesInput = {
  organizationId: string;
  createdByUserId: string;
  sourceMessageId: string;
  message: string;
  // Callers that already loaded active memory items for this same request
  // (e.g. the chat route) can pass them here to skip the redundant internal
  // re-fetch below. Falls back to fetching them when omitted.
  activeMemoryItems?: MemoryItemResult[];
};

export type CreateDeterministicUpdateCandidatesResult = {
  created: MemoryCandidate[];
  skipped: MemoryCandidateDescriptor[];
};
