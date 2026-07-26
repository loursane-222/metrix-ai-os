import type {
  ExecutiveDecisionOutcomeType,
  ExecutiveDecisionRecordStatus,
} from "@prisma/client";

export type ExecutiveOutcomeStatusV1 =
  | "ACHIEVED"
  | "PARTIALLY_ACHIEVED"
  | "NOT_ACHIEVED"
  | "ABANDONED"
  | "PENDING"
  | "UNKNOWN";

export type ExecutiveOutcomeSourceV1 =
  | ExecutiveDecisionOutcomeType
  | "UNAVAILABLE";

export type ExecutiveOutcomeConfidenceV1 = "LOW" | "MEDIUM" | "HIGH";

export type ExecutiveOutcomeEvidenceReferenceV1 = Readonly<{
  id: string;
  kind:
    | "USER_STATEMENT"
    | "DECISION_RECORD"
    | "DECISION_OUTCOME"
    | "ACTION_RESULT"
    | "DOMAIN_EVENT";
}>;

/**
 * Canonical runtime projection of persisted management outcome authority.
 * It cannot write persistence, complete tasks, produce responses, or create decisions.
 */
export type ExecutiveOutcomeV1 = Readonly<{
  schemaVersion: "1.0";
  outcomeId: string;
  decisionRecordId: string;
  organizationId: string;
  conversationId: string | null;
  sourceMessageId: string | null;
  objective: Readonly<{
    title: string;
    rationale: string | null;
    category: string | null;
    priority: string | null;
  }>;
  status: ExecutiveOutcomeStatusV1;
  sourceOutcome: ExecutiveOutcomeSourceV1;
  completion: Readonly<{
    decisionStatus: ExecutiveDecisionRecordStatus;
    committedAt: string | null;
    occurredAt: string | null;
    closedAt: string | null;
    followUpDueAt: string | null;
  }>;
  resultSummary: string | null;
  evidence: readonly ExecutiveOutcomeEvidenceReferenceV1[];
  managementImpact: Readonly<{
    objectiveAchieved: boolean | null;
    riskReduced: boolean | null;
    valueCreated: boolean | null;
    requiresReagenda: boolean;
    requiresFollowUp: boolean;
  }>;
  confidence: ExecutiveOutcomeConfidenceV1;
  generatedAt: string;
}>;
