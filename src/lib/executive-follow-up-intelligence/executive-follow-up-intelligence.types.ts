import type { ExecutiveDecisionFollowUpResult } from "@/lib/executive-decision-follow-up";
import type { ExecutiveAccountabilityResult } from "@/lib/executive-accountability";
import type {
  CompletedActionOutcomeInput,
  ExecutiveActionOutcomeSummary,
} from "@/lib/core/executive-actions/executive-action-outcome-summary.service";

export type ActionFollowUpStatus = "COMPLETED" | "PENDING" | "OVERDUE";

export type ActionFollowUpSource = "DECISION_FOLLOW_UP" | "ACCOUNTABILITY";

export type ActionFollowUpCriticality = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type TrackedAction = {
  id: string;
  title: string;
  status: ActionFollowUpStatus;
  source: ActionFollowUpSource;
  completionEvidence: string | null;
  daysOpen: number | null;
  criticalityLevel: ActionFollowUpCriticality;
};

export type ExecutiveFollowUpPromptSummary = {
  summaryLine: string;
  executionScoreLabel: string;
  topCriticalFollowUp: string | null;
  hasOverdue: boolean;
};

export type ExecutiveFollowUpReport = {
  organizationId: string;
  generatedAt: string;
  completedActions: TrackedAction[];
  pendingActions: TrackedAction[];
  overdueActions: TrackedAction[];
  executionScore: number;
  summary: string;
  criticalFollowUps: TrackedAction[];
  promptSummary: ExecutiveFollowUpPromptSummary;
  recentActionOutcomes: ExecutiveActionOutcomeSummary | null;
};

export type BuildExecutiveFollowUpIntelligenceInput = {
  organizationId: string;
  now?: Date;
  executiveDecisionFollowUp: ExecutiveDecisionFollowUpResult | null;
  executiveAccountability: ExecutiveAccountabilityResult | null;
  recentCompletedActions?: CompletedActionOutcomeInput[] | null;
};
