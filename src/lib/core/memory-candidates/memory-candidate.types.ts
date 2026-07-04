import type {
  MemoryCandidate,
  MemoryItemSource,
  MemoryItemType,
  MemorySubjectType,
  Prisma,
} from "@prisma/client";

export type MemoryCandidateResult = MemoryCandidate;

export type CreateMemoryCandidateInput = {
  organizationId: string;
  createdByUserId?: string | null;
  subjectType: MemorySubjectType;
  subjectId?: string | null;
  proposedType: MemoryItemType;
  proposedKey: string;
  proposedValue: string;
  source: MemoryItemSource;
  confidence?: number;
  isAssumption?: boolean;
  reason: string;
  evidenceJson?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  sourceEventId?: string | null;
  sourceMessageId?: string | null;
};

export type CreateMemoryCandidateRepositoryInput =
  Omit<CreateMemoryCandidateInput, "confidence"> & {
    confidence?: number;
  };

