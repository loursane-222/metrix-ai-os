import type {
  ExecutiveResponsibilityMatrixPromptSummary,
  ExecutiveResponsibilityMatrixResult,
} from "./executive-responsibility-matrix.types";

export function buildExecutiveResponsibilityMatrixPromptSummary(
  result: ExecutiveResponsibilityMatrixResult,
): ExecutiveResponsibilityMatrixPromptSummary {
  return {
    responsibleParty: result.responsibleParty,
    decisionOwner: result.decisionOwner,
    followUpOwner: result.followUpOwner,
    riskOwner: result.riskOwner,
    expectedOutput: result.expectedOutput,
    userRoleInThisMatter: result.userRoleInThisMatter,
    executiveManagementStance: result.executiveManagementStance,
    managementInstruction: result.managementInstruction,
    escalationRisk: result.escalationRisk,
    requiresOwnerClarification: result.requiresOwnerClarification,
    shouldCreateTask: false,
    confidence: result.confidence,
  };
}
