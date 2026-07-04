import type {
  ExecutiveBrainImpact,
  ExecutiveBrainSeverity,
} from "../executive-brain.types";

export type ExecutiveDirectorRole =
  | "ai-general-manager"
  | "sales-director"
  | "finance-director"
  | "operations-director"
  | "people-director"
  | "marketing-director"
  | "customer-success-director"
  | "executive-assistant";

export type ExecutiveDirectorFinding = {
  id: string;
  severity: ExecutiveBrainSeverity;
  title: string;
  explanation: string;
  evidenceRefs: string[];
};

export type ExecutiveDirectorRecommendation = {
  id: string;
  impact: ExecutiveBrainImpact;
  title: string;
  explanation: string;
  suggestedAction: string;
  evidenceRefs: string[];
};

export type ExecutiveDirectorPriority = {
  id: string;
  impact: ExecutiveBrainImpact;
  title: string;
  explanation: string;
  suggestedAction: string;
  evidenceRefs: string[];
};

export type ExecutiveDirectorAssessment = {
  id: string;
  role: ExecutiveDirectorRole;
  title: string;
  findings: ExecutiveDirectorFinding[];
  recommendations: ExecutiveDirectorRecommendation[];
  priorities: ExecutiveDirectorPriority[];
  confidence: number;
};

export type ExecutiveDirectorRegistryItem = {
  id: ExecutiveDirectorRole;
  role: ExecutiveDirectorRole;
  title: string;
  description: string;
  domain: string;
  mission: string;
  experienceProfile: string;
  expertiseAreas: string[];
  strategicResponsibilities: string[];
  dailySignals: string[];
  kpis: string[];
  riskLens: string[];
  opportunityLens: string[];
  escalationRules: string[];
  decisionBoundaries: string[];
};

export type ExecutiveDirectorProfile = ExecutiveDirectorRegistryItem;
