import type { ExecutiveDecisionOutcomeType } from "@prisma/client";
import type {
  ExecutiveDecisionContext,
  ExecutiveDecisionOutcomeSummary,
  ExecutiveDecisionRecordSummary,
} from "@/lib/executive-decision-loop";

export type ExecutiveDecisionFollowUpStatus =
  | "OPEN_PROPOSED"
  | "AWAITING_RESULT"
  | "OVERDUE"
  | "RESOLVED_SUCCESS"
  | "RESOLVED_FAILURE"
  | "ABANDONED"
  | "REAGENDA_REQUIRED";

export type ExecutiveDecisionFollowUpPriority =
  | "LOW"
  | "WATCH"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export type ExecutiveDecisionFollowUpSource = "DECISION" | "OUTCOME";

export type ExecutiveDecisionFollowUpItem = {
  id: string;
  source: ExecutiveDecisionFollowUpSource;
  status: ExecutiveDecisionFollowUpStatus;
  title: string;
  reason: string;
  actionHint: string | null;
  priority: ExecutiveDecisionFollowUpPriority;
  dueAt: string | null;
  ageDays: number | null;
  decisionId: string | null;
  outcomeId: string | null;
  outcome: ExecutiveDecisionOutcomeType | null;
  shouldReagenda: boolean;
};

export type ExecutiveDecisionFollowUpAgendaRecommendation = {
  shouldRaise: boolean;
  status: ExecutiveDecisionFollowUpStatus | null;
  title: string | null;
  reason: string | null;
  actionHint: string | null;
  urgency: ExecutiveDecisionFollowUpPriority | null;
};

export type ExecutiveDecisionFollowUpPromptSummary = {
  summaryLine: string;
  primaryStatus: ExecutiveDecisionFollowUpStatus | null;
  primaryTitle: string | null;
  primaryActionHint: string | null;
};

export type ExecutiveDecisionFollowUpDiagnostics = {
  generatedAt: string;
  staleThresholdDays: number;
  sourceOpenDecisionCount: number;
  sourceCommittedDecisionCount: number;
  sourceOutcomeCount: number;
  warnings: string[];
};

export type ExecutiveDecisionFollowUpResult = {
  organizationId: string;
  generatedAt: string;
  items: ExecutiveDecisionFollowUpItem[];
  overdueItems: ExecutiveDecisionFollowUpItem[];
  staleProposedItems: ExecutiveDecisionFollowUpItem[];
  recentOutcomes: ExecutiveDecisionFollowUpItem[];
  primaryFollowUp: ExecutiveDecisionFollowUpItem | null;
  agendaRecommendation: ExecutiveDecisionFollowUpAgendaRecommendation;
  summaryLine: string;
  promptSummary: ExecutiveDecisionFollowUpPromptSummary;
  diagnostics: ExecutiveDecisionFollowUpDiagnostics;
};

export type BuildExecutiveDecisionFollowUpInput = {
  organizationId: string;
  now?: Date;
  executiveDecisionContext: ExecutiveDecisionContext | null;
};

export type BuildDecisionFollowUpSummaryInput = {
  organizationId: string;
  now: Date;
  openDecisions: ExecutiveDecisionRecordSummary[];
  committedDecisions: ExecutiveDecisionRecordSummary[];
  latestOutcome: ExecutiveDecisionOutcomeSummary | null;
};
