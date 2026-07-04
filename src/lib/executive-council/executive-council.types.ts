import type {
  DirectorOpinion,
  DirectorOpinionBundle,
  DirectorOpinionEvidence,
  DirectorType,
} from "@/lib/director-opinions";

export type ExecutiveCouncilSynthesisVersion = "v1";

export type ExecutiveCouncilConfidence = "LOW" | "MEDIUM" | "HIGH";

export type ExecutiveCouncilUrgency =
  | "LOW"
  | "WATCH"
  | "IMPORTANT"
  | "URGENT";

export type ExecutiveCouncilPosition =
  | "STABLE"
  | "WATCHFUL"
  | "PRESSURED"
  | "CRITICAL"
  | "UNCERTAIN";

export type ExecutiveCouncilEvidence = {
  sourceDirectorTypes: DirectorType[];
  label: string;
  value: string;
  sourceEvidence: DirectorOpinionEvidence[];
};

export type ExecutiveCouncilConsensusItem = {
  title: string;
  summary: string;
  urgency: ExecutiveCouncilUrgency;
  participantDirectorTypes: DirectorType[];
  evidenceRefs: string[];
};

export type ExecutiveCouncilDisagreement = {
  title: string;
  summary: string;
  directorPositions: ExecutiveCouncilDirectorPosition[];
  severity: ExecutiveCouncilUrgency;
};

export type ExecutiveCouncilDirectorPosition = {
  directorType: DirectorType;
  urgency: ExecutiveCouncilUrgency;
  confidence: ExecutiveCouncilConfidence;
  summary: string;
};

export type ExecutiveCouncilPriorityConflict = {
  title: string;
  summary: string;
  affectedDirectorTypes: DirectorType[];
  urgency: ExecutiveCouncilUrgency;
  recommendedResolution: string;
};

export type ExecutiveCouncilStance = {
  position: ExecutiveCouncilPosition;
  title: string;
  rationale: string;
  urgency: ExecutiveCouncilUrgency;
};

export type ExecutiveCouncilAction = {
  title: string;
  rationale: string;
  urgency: ExecutiveCouncilUrgency;
  sourceDirectorTypes: DirectorType[];
};

export type ExecutiveCouncilQuestion = {
  title: string;
  reason: string;
  sourceDirectorTypes: DirectorType[];
};

export type ExecutiveCouncilSynthesis = {
  councilPosition: ExecutiveCouncilPosition;
  consensusItems: ExecutiveCouncilConsensusItem[];
  disagreements: ExecutiveCouncilDisagreement[];
  priorityConflicts: ExecutiveCouncilPriorityConflict[];
  recommendedExecutiveStance: ExecutiveCouncilStance;
  recommendedActions: ExecutiveCouncilAction[];
  unresolvedQuestions: ExecutiveCouncilQuestion[];
  evidence: ExecutiveCouncilEvidence[];
  confidence: ExecutiveCouncilConfidence;
  generatedAt: string;
  version: ExecutiveCouncilSynthesisVersion;
};

export type BuildExecutiveCouncilSynthesisInput = {
  organizationId: string;
  directorOpinionBundle: DirectorOpinionBundle;
  now?: Date;
};

export type ExecutiveCouncilComparableOpinion = Pick<
  DirectorOpinion,
  | "directorType"
  | "opinionTitle"
  | "executiveSummary"
  | "urgency"
  | "confidence"
  | "risks"
  | "opportunities"
  | "recommendedActions"
  | "evidence"
>;
