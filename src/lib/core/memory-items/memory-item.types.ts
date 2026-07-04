import type {
  MemoryItem,
  MemoryItemSource,
  MemoryItemType,
  MemorySubjectType,
  Prisma,
} from "@prisma/client";

export type MemoryItemResult = MemoryItem;

export type CreateApprovedMemoryItemInput = {
  organizationId: string;
  createdByUserId?: string | null;
  subjectType: MemorySubjectType;
  subjectId?: string | null;
  type: MemoryItemType;
  key: string;
  value: string;
  source: MemoryItemSource;
  confidence?: number;
  isUserConfirmed?: boolean;
  sourceEventId?: string | null;
  sourceCandidateId?: string | null;
  supersedesMemoryId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export type CreateApprovedMemoryItemRepositoryInput =
  Omit<CreateApprovedMemoryItemInput, "confidence"> & {
    confidence?: number;
  };

export type UpdateMemoryItemForOrganizationInput = {
  id: string;
  organizationId: string;
  updatedByUserId: string;
  value: string;
};
