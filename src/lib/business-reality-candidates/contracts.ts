import type {
  BusinessCandidateOperation,
  BusinessCandidateSourceChannel,
} from "@prisma/client";

export type BusinessCandidateChangeProposal = Readonly<{
  fieldPath: string;
  previousValue?: unknown;
  proposedValue: unknown;
  confidence?: number;
  requiresApproval?: boolean;
}>;

export type BusinessProposition = Readonly<{
  propositionType: string;
  targetDomain: string;
  targetRecordId?: string | null;
  operation: BusinessCandidateOperation;
  confidence?: number;
  requiresApproval?: boolean;
  provenance: Readonly<Record<string, unknown>>;
  changes: readonly BusinessCandidateChangeProposal[];
}>;

export type PersistBusinessPropositionsInput = Readonly<{
  organizationId: string;
  conversationId?: string | null;
  sourceChannel: BusinessCandidateSourceChannel;
  sourceMessageId?: string | null;
  sourceEventId?: string | null;
  sourceInputId: string;
  propositions: readonly BusinessProposition[];
  expiresAt?: Date | null;
}>;

export type BusinessCandidatePromotionExecution = Readonly<{
  executionId: string;
  targetRecordId: string;
  canonicalOperation: string;
  success: boolean;
  result?: unknown;
  errorCode?: string;
}>;

export type BusinessCandidatePromotionExecutor = (
  input: Readonly<{
    candidateId: string;
    organizationId: string;
    targetDomain: string;
    targetRecordId: string | null;
    operation: BusinessCandidateOperation;
    approvedChanges: readonly Readonly<{
      changeId: string;
      fieldPath: string;
      proposedValue: unknown;
    }>[];
    idempotencyKey: string;
  }>,
) => Promise<BusinessCandidatePromotionExecution>;
