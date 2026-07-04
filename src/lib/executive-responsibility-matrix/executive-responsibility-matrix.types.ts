import type { ExecutiveDecisionResult } from "@/lib/executive-decision-engine";
import type {
  ExecutiveDelegationConfidence,
  ExecutiveDelegationOwnerType,
  ExecutiveDelegationResult,
} from "@/lib/executive-delegation";
import type { ExecutiveOperatingContext } from "@/lib/executive-operating-context";

export type ExecutiveResponsibilityMatrixOwner = {
  ownerType: ExecutiveDelegationOwnerType;
  ownerName?: string | null;
  reason: string;
};

export type ExecutiveResponsibilityMatrixResult = {
  responsibleParty: ExecutiveResponsibilityMatrixOwner;
  decisionOwner: ExecutiveResponsibilityMatrixOwner;
  followUpOwner: ExecutiveResponsibilityMatrixOwner;
  riskOwner: ExecutiveResponsibilityMatrixOwner;
  expectedOutput: string;
  userRoleInThisMatter: string;
  executiveManagementStance: string;
  managementInstruction: string;
  escalationRisk: string;
  requiresOwnerClarification: boolean;
  sourceSignals: string[];
  shouldCreateTask: false;
  confidence: ExecutiveDelegationConfidence;
};

export type ExecutiveResponsibilityMatrixPromptSummary = {
  responsibleParty: ExecutiveResponsibilityMatrixOwner;
  decisionOwner: ExecutiveResponsibilityMatrixOwner;
  followUpOwner: ExecutiveResponsibilityMatrixOwner;
  riskOwner: ExecutiveResponsibilityMatrixOwner;
  expectedOutput: string;
  userRoleInThisMatter: string;
  executiveManagementStance: string;
  managementInstruction: string;
  escalationRisk: string;
  requiresOwnerClarification: boolean;
  shouldCreateTask: false;
  confidence: ExecutiveDelegationConfidence;
};

export type ExecutiveResponsibilityMatrixEngineInput = {
  operatingContext: ExecutiveOperatingContext;
  executiveDecisionResult: ExecutiveDecisionResult | null;
  executiveDelegationResult: ExecutiveDelegationResult | null;
};
