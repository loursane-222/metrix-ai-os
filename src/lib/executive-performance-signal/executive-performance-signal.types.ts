import type { ExecutiveDecisionResult } from "@/lib/executive-decision-engine";
import type { ExecutiveDelegationResult } from "@/lib/executive-delegation";
import type { ExecutiveDecisionOutcomeAggregate } from "@/lib/executive-decision-loop";
import type { ExecutiveOperatingContext } from "@/lib/executive-operating-context";
import type { ExecutiveResponsibilityMatrixResult } from "@/lib/executive-responsibility-matrix";

export type ExecutivePerformanceSignalType =
  | "OWNER_UNCLEAR"
  | "FOLLOW_UP_MISSING"
  | "REPEATED_DELAY_RISK"
  | "TREND_PRESSURE_RISK"
  | "OUTCOME_QUALITY_RISK"
  | "USER_OVERLOADED"
  | "CUSTOMER_BOTTLENECK"
  | "TEAM_BOTTLENECK"
  | "SUPPLIER_BOTTLENECK"
  | "EXECUTION_RISK"
  | "DECISION_STALL"
  | "ACCOUNTABILITY_GAP";

export type ExecutivePerformanceSignalPriority =
  | "WATCH"
  | "HIGH"
  | "CRITICAL";

export type ExecutivePerformanceSignalSubject =
  | "USER"
  | "TEAM"
  | "CUSTOMER"
  | "SUPPLIER"
  | "SYSTEM"
  | "UNKNOWN";

export type ExecutivePerformanceSignalConfidence =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export type ExecutivePerformanceSignal = {
  type: ExecutivePerformanceSignalType;
  priority: ExecutivePerformanceSignalPriority;
  subject: ExecutivePerformanceSignalSubject;
  ownerName?: string | null;
  title: string;
  reason: string;
  suggestedResponseBehavior: string;
  evidenceRefs: string[];
};

export type ExecutivePerformanceSignalDiagnostics = {
  signalCount: number;
  hasCriticalSignal: boolean;
  hasOwnerUnclearSignal: boolean;
  hasUserOverloadSignal: boolean;
  sourceCount: number;
};

export type ExecutivePerformanceSignalResult = {
  organizationId: string | null;
  generatedAt: string;
  signals: ExecutivePerformanceSignal[];
  primarySignal: ExecutivePerformanceSignal | null;
  managementConcern: string | null;
  recommendedManagementMove: string | null;
  userProtectionInstruction: string | null;
  shouldSurfaceToUser: boolean;
  confidence: ExecutivePerformanceSignalConfidence;
  diagnostics: ExecutivePerformanceSignalDiagnostics;
};

export type ExecutivePerformanceSignalPromptSummary = {
  primarySignal: Pick<
    ExecutivePerformanceSignal,
    "priority" | "subject" | "ownerName" | "title" | "reason" | "suggestedResponseBehavior"
  > | null;
  managementConcern: string | null;
  recommendedManagementMove: string | null;
  userProtectionInstruction: string | null;
  shouldSurfaceToUser: boolean;
  confidence: ExecutivePerformanceSignalConfidence;
};

export type ExecutivePerformanceSignalEngineInput = {
  operatingContext: ExecutiveOperatingContext;
  executiveDecisionResult: ExecutiveDecisionResult | null;
  executiveDelegationResult: ExecutiveDelegationResult | null;
  executiveResponsibilityMatrixResult: ExecutiveResponsibilityMatrixResult | null;
  outcomeAggregate?: ExecutiveDecisionOutcomeAggregate | null;
};
