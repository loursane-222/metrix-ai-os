import type { ExecutiveDecisionResult } from "@/lib/executive-decision-engine";
import type { ExecutiveOperatingContext } from "@/lib/executive-operating-context";
import type { ExecutivePerformanceSignalResult } from "@/lib/executive-performance-signal";
import type { ExecutiveResponsibilityMatrixResult } from "@/lib/executive-responsibility-matrix";
import type { CompanyPerformanceSignal } from "@/lib/company-performance-signal";
import type { ExecutiveDecisionOutcomeAggregate } from "@/lib/executive-decision-loop";

export type ExecutiveManagementReviewType =
  | "CLEAR_ACTION_REQUIRED"
  | "OWNER_CLARIFICATION_REQUIRED"
  | "WAITING_ON_CUSTOMER"
  | "USER_OVERLOAD_RISK"
  | "EXECUTION_CONTROL_REQUIRED"
  | "STRATEGIC_DECISION_REQUIRED"
  | "DATA_INSUFFICIENT"
  | "LOW_RISK_MONITOR_ONLY"
  | "ACCOUNTABILITY_FOLLOW_UP_REQUIRED"
  | "COMPANY_PERFORMANCE_CRITICAL"
  | "DECISION_DISCIPLINE_RISK"
  | "TOP_POSITIVE_SIGNAL";

export type ExecutiveManagementLeadershipTone =
  | "CALM"
  | "DIRECT"
  | "FIRM"
  | "CAUTIOUS";

export type ExecutiveManagementReviewConfidence =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export type ExecutiveManagementReviewDiagnostics = {
  sourceCount: number;
  hasLowData: boolean;
  primarySource: string | null;
};

export type ExecutiveManagementReviewResult = {
  organizationId: string | null;
  generatedAt: string;
  reviewType: ExecutiveManagementReviewType;
  executiveRead: string;
  mainManagementConcern: string | null;
  nonNegotiableFocus: string | null;
  leadershipTone: ExecutiveManagementLeadershipTone;
  userDirection: string;
  clarificationNeeded: string | null;
  shouldChallengeUser: boolean;
  shouldProtectUser: boolean;
  shouldSurfaceToUser: boolean;
  confidence: ExecutiveManagementReviewConfidence;
  sourceSignals: string[];
  diagnostics: ExecutiveManagementReviewDiagnostics;
};

export type ExecutiveManagementReviewPromptSummary = {
  reviewType: ExecutiveManagementReviewType;
  executiveRead: string;
  mainManagementConcern: string | null;
  nonNegotiableFocus: string | null;
  leadershipTone: ExecutiveManagementLeadershipTone;
  userDirection: string;
  clarificationNeeded: string | null;
  shouldChallengeUser: boolean;
  shouldProtectUser: boolean;
  shouldSurfaceToUser: boolean;
  confidence: ExecutiveManagementReviewConfidence;
};

export type ExecutiveManagementReviewEngineInput = {
  operatingContext: ExecutiveOperatingContext;
  executiveDecisionResult: ExecutiveDecisionResult | null;
  executivePerformanceSignalResult: ExecutivePerformanceSignalResult | null;
  executiveResponsibilityMatrixResult: ExecutiveResponsibilityMatrixResult | null;
  companyPerformanceSignal: CompanyPerformanceSignal | null;
  outcomeAggregate: ExecutiveDecisionOutcomeAggregate | null;
};
