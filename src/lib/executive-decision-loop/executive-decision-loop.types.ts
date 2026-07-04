import type {
  ExecutiveDecisionOutcomeType,
  ExecutiveDecisionRecord,
  ExecutiveDecisionRecordSourceType,
  ExecutiveDecisionRecordStatus,
} from "@prisma/client";
import type { ExecutiveAlertBundle } from "@/lib/executive-alerts/executive-alert.types";
import type { ExecutiveBrainShadowMetadata } from "@/lib/executive-brain/executive-brain.types";
import type { ExecutiveRecommendationPackage } from "@/lib/ai/executive-conversation.types";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";

export type ExecutiveDecisionPriority =
  | "LOW"
  | "WATCH"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export type ExecutiveDecisionRecordCandidate = {
  organizationId: string;
  conversationId: string | null;
  sourceType: ExecutiveDecisionRecordSourceType;
  sourceKey: string;
  sourceSnapshotId: string | null;
  title: string;
  rationale: string;
  actionHint: string | null;
  category: string | null;
  priority: ExecutiveDecisionPriority | null;
  confidenceScore: number | null;
  evidenceJson: object | null;
  sourcePayload: object;
  decisionDate: string;
};

export type BuildExecutiveDecisionRecordCandidatesInput = {
  organizationId: string;
  conversationId: string;
  decisionDate: string;
  sourceSnapshotId?: string | null;
  recommendationPackage?: ExecutiveRecommendationPackage | null;
  executiveBrainContext?: ExecutiveBrainShadowMetadata | null;
  executiveAlerts?: ExecutiveAlertBundle | null;
  executiveForecast?: ExecutiveForecast | null;
};

export type EnsureExecutiveDecisionRecordsInput =
  BuildExecutiveDecisionRecordCandidatesInput;

export type ExecutiveDecisionRecordSummary = {
  id: string;
  title: string;
  rationale: string;
  actionHint: string | null;
  category: string | null;
  priority: string | null;
  status: ExecutiveDecisionRecordStatus;
  followUpDueAt: string | null;
  decisionDate: string;
};

export type ExecutiveDecisionOutcomeSummary = {
  id: string;
  decisionTitle: string;
  outcome: ExecutiveDecisionOutcomeType;
  summary: string | null;
  occurredAt: string;
};

export type DecisionDisciplineRiskTier = {
  hasBaseRisk: boolean;
  hasRepeatedPattern: boolean;
  isCriticalPattern: boolean;
  shouldChallenge: boolean;
};

export type DecisionDisciplineTrend = {
  direction: "IMPROVING" | "STABLE" | "DECLINING";
  previousSuccessRate: number | null;
  currentSuccessRate: number | null;
  delta: number | null;
  previousTotalClosed: number;
};

export type ExecutiveDecisionOutcomeAggregate = {
  organizationId: string;
  windowDays: 30;
  totalClosed: number;
  successCount: number;
  failureCount: number;
  abandonedCount: number;
  successRate: number | null;
  failureRate: number | null;
  avgCommitToCloseDays: number | null;
  staleOpenCount: number;
  qualitySignal: "STRONG" | "WATCH" | "WEAK" | "UNKNOWN";
  confidence: "LOW" | "MEDIUM" | "HIGH";
  repeatedFailureCount: number;
  reAgendaCount: number;
  riskTier: DecisionDisciplineRiskTier | null;
  trend: DecisionDisciplineTrend | null;
};

export type ExecutiveDecisionContext = {
  openDecisions: ExecutiveDecisionRecordSummary[];
  committedDecisions: ExecutiveDecisionRecordSummary[];
  overdueCommittedDecision: ExecutiveDecisionRecordSummary | null;
  latestOutcome: ExecutiveDecisionOutcomeSummary | null;
  outcomeAggregate: ExecutiveDecisionOutcomeAggregate | null;
};

export type BuildExecutiveDecisionContextInput = {
  organizationId: string;
  now?: Date;
};

export type RegisterExecutiveDecisionCommitmentInput = {
  organizationId: string;
  conversationId: string;
  sourceMessageId: string;
  committedTitle: string;
  committedAt?: string | null;
  followUpDueAt?: string | null;
};

export type RegisterExecutiveDecisionOutcomeInput = {
  organizationId: string;
  conversationId: string;
  sourceMessageId: string;
  committedTitle: string;
  outcome: ExecutiveDecisionOutcomeType;
  summary?: string | null;
  evidenceJson?: object | null;
};

export type ExecutiveDecisionRecordWithOutcome = ExecutiveDecisionRecord & {
  outcomes?: Array<{
    id: string;
    outcome: ExecutiveDecisionOutcomeType;
    summary: string | null;
    occurredAt: Date;
  }>;
};
