import type {
  ExecutiveBrainImpact,
  ExecutiveBrainRecognitionDomain,
  ExecutiveBrainSeverity,
} from "@/lib/executive-brain/executive-brain.types";

export type ExecutiveAssessmentSourceV1 =
  | "executive_brain"
  | "deterministic_fallback"
  | "unavailable";

export type ExecutiveAssessmentStatusV1 =
  | "AVAILABLE"
  | "PARTIAL"
  | "UNAVAILABLE";

export type ExecutiveAssessmentConfidenceV1 = "LOW" | "MEDIUM" | "HIGH";

export type ExecutiveAssessmentEvidenceKindV1 =
  | "MEMORY"
  | "DOMAIN_RECORD"
  | "USER_STATEMENT"
  | "PRIOR_DECISION"
  | "ACTION_RESULT"
  | "EXTERNAL_CONTEXT";

export type ExecutiveAssessmentCategoryV1 =
  | ExecutiveBrainRecognitionDomain
  | "sales"
  | "strategy";

export type ExecutiveAssessmentTimeHorizonV1 =
  | "IMMEDIATE"
  | "NEAR_TERM"
  | "LONG_TERM";

export type ExecutiveAssessmentEvidenceV1 = Readonly<{
  id: string;
  kind: ExecutiveAssessmentEvidenceKindV1;
  category: ExecutiveAssessmentCategoryV1;
  source: string;
  summary: string;
  confidence: ExecutiveAssessmentConfidenceV1;
}>;

export type ExecutiveAssessmentFindingV1 = Readonly<{
  id: string;
  category: ExecutiveAssessmentCategoryV1;
  severity: ExecutiveBrainSeverity;
  summary: string;
  evidenceReferences: readonly string[];
  confidence: ExecutiveAssessmentConfidenceV1;
  isAssumption: boolean;
}>;

export type ExecutiveAssessmentRiskV1 = Readonly<{
  id: string;
  category: ExecutiveAssessmentCategoryV1;
  severity: ExecutiveBrainSeverity;
  likelihood: ExecutiveBrainImpact;
  timeHorizon: ExecutiveAssessmentTimeHorizonV1;
  reversibility: "REVERSIBLE" | "PARTIALLY_REVERSIBLE" | "IRREVERSIBLE";
  evidenceReferences: readonly string[];
  confidence: ExecutiveAssessmentConfidenceV1;
}>;

export type ExecutiveAssessmentOpportunityV1 = Readonly<{
  id: string;
  category: ExecutiveAssessmentCategoryV1;
  potentialValue: ExecutiveBrainImpact;
  probability: ExecutiveBrainImpact;
  timeWindow: ExecutiveAssessmentTimeHorizonV1;
  requiredConditions: readonly string[];
  evidenceReferences: readonly string[];
  confidence: ExecutiveAssessmentConfidenceV1;
}>;

export type ExecutiveAssessmentTradeoffV1 = Readonly<{
  id: string;
  summary: string;
  evidenceReferences: readonly string[];
  confidence: ExecutiveAssessmentConfidenceV1;
}>;

export type ExecutiveAssessmentDecisionFactorV1 = Readonly<{
  id: string;
  category: ExecutiveAssessmentCategoryV1;
  summary: string;
  weight: ExecutiveBrainImpact;
  evidenceReferences: readonly string[];
}>;

/**
 * Canonical, turn-level management meaning. This artifact has no response,
 * intent, behavior, tool, approval, voice, execution, or persistence authority.
 */
export type ExecutiveAssessmentV1 = Readonly<{
  schemaVersion: "1.0";
  assessmentId: string;
  source: ExecutiveAssessmentSourceV1;
  status: ExecutiveAssessmentStatusV1;
  evidence: readonly ExecutiveAssessmentEvidenceV1[];
  findings: readonly ExecutiveAssessmentFindingV1[];
  risks: readonly ExecutiveAssessmentRiskV1[];
  opportunities: readonly ExecutiveAssessmentOpportunityV1[];
  tradeoffs: readonly ExecutiveAssessmentTradeoffV1[];
  decisionFactors: readonly ExecutiveAssessmentDecisionFactorV1[];
  timeImpact: Readonly<{
    immediate: readonly string[];
    nearTerm: readonly string[];
    longTerm: readonly string[];
  }>;
  evidenceGaps: readonly string[];
  confidence: ExecutiveAssessmentConfidenceV1;
  generatedAt: string;
}>;

export type ExecutiveAssessmentDirectiveSignalsV1 = Readonly<{
  status: ExecutiveAssessmentStatusV1;
  highestRisk: ExecutiveBrainSeverity | null;
  hasEvidenceGaps: boolean;
  hasImmediateTimePressure: boolean;
  decisionFactorCount: number;
  confidence: ExecutiveAssessmentConfidenceV1;
}>;
