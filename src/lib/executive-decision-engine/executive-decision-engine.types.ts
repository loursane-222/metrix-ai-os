import type { ExecutiveOperatingContext } from "@/lib/executive-operating-context";
import type { ExecutiveLearningResolverDecision } from "@/lib/executive-learning-resolver";
import type { ExecutiveMindState } from "@/lib/ai/executive-conversation.types";

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

/**
 * Kararin dayandigi kategoriyle iliskili bir veri adiminin (diagnostics.failedSteps)
 * basarisiz oldugunu isaret eder. Yalnizca bilinen bir domain arizasi oldugunda dolar;
 * teorik/genel bir guven skoru degildir.
 */
export type ExecutiveDecisionEvidenceReliability = {
  status: "DEGRADED";
  failedSteps: string[];
};

export type ExecutiveDecisionPromptSummary = {
  priority: ExecutiveDecisionPriority;
  category: ExecutiveDecisionCategory;
  decisionLine: string;
  firstAction: string;
  riskLine: string | null;
  confidence: ExecutiveDecisionConfidence;
  /** @ownership executive-evidence-bridge — bkz. ExecutiveDecision.evidenceRefs, aynen taşınır. */
  evidenceRefs: string[];
  /** @ownership executive-evidence-bridge — bkz. ExecutiveDecision.sourceSignals, aynen taşınır. */
  sourceSignals: string[];
  /** @ownership executive-evidence-bridge — bkz. ExecutiveDecision.evidenceReliability, aynen taşınır. */
  evidenceReliability: ExecutiveDecisionEvidenceReliability | null;
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
  evidenceReliability: ExecutiveDecisionEvidenceReliability | null;
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
  mindState?: ExecutiveMindState | null;
};

