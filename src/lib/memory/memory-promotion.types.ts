export type MemoryPromotionReason =
  | "PROMOTED"
  | "CANDIDATE_NOT_PENDING"
  | "DUPLICATE_ACTIVE_MEMORY"
  | "INVALID_SUPERSEDE_TARGET"
  | "SUPERSEDE_REQUIRED";

export type ApproveMemoryCandidateForOrganizationInput = {
  organizationId: string;
  candidateId: string;
  approverUserId: string;
  supersedesMemoryId?: string | null;
};

export type MemoryPromotionResult = {
  promoted: boolean;
  reason: MemoryPromotionReason;
  candidateId: string;
  memoryItemId?: string;
};
