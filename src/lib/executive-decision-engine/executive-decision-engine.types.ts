import type { ExecutiveOperatingContext } from "@/lib/executive-operating-context";
import type { ExecutiveLearningResolverDecision } from "@/lib/executive-learning-resolver";

export type ExecutiveDecisionCategory =
  | "CASH"
  | "COLLECTION"
  | "SALES"
  | "EXECUTION"
  | "DECISION_FOLLOW_UP"
  | "MARKET"
  | "DATA_QUALITY"
  | "STRATEGY"
  | "PEOPLE"
  | "CUSTOMER";

export type ExecutiveDecisionPriority =
  | "LOW"
  | "WATCH"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export type ExecutiveDecisionConfidence = "LOW" | "MEDIUM" | "HIGH";

export type ExecutiveDecisionPromptSummary = {
  priority: ExecutiveDecisionPriority;
  category: ExecutiveDecisionCategory;
  decisionLine: string;
  firstAction: string;
  riskLine: string | null;
  confidence: ExecutiveDecisionConfidence;
};

export type ExecutiveDecision = {
  id: string;
  category: ExecutiveDecisionCategory;
  priority: ExecutiveDecisionPriority;
  title: string;
  rationale: string;
  firstAction: string;
  supportingActions: string[];
  risks: string[];
  opportunities: string[];
  impact: number;
  urgency: number;
  confidence: ExecutiveDecisionConfidence;
  confidenceScore: number;
  evidenceRefs: string[];
  sourceSignals: string[];
  followUpWindow: string | null;
  isFallback: boolean;
};

export type ExecutiveDecisionResult = {
  organizationId: string;
  generatedAt: string;
  mode: ExecutiveOperatingContext["mode"];
  primaryDecision: ExecutiveDecision;
  supportingDecisions: ExecutiveDecision[];
  risks: string[];
  opportunities: string[];
  decisionSummary: string;
  promptSummary: ExecutiveDecisionPromptSummary;
  overallConfidence: ExecutiveDecisionConfidence;
  dataQualityNote: string | null;
  diagnostics: {
    failedSteps: string[];
    fallbackReason: string | null;
  };
};

export type BuildExecutiveDecisionResultInput = {
  operatingContext: ExecutiveOperatingContext;
  resolverDecision?: ExecutiveLearningResolverDecision | null;
};

