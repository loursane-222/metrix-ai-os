import type {
  ExecutiveDelegationPromptSummary,
  ExecutiveDelegationResult,
} from "./executive-delegation.types";

export function buildExecutiveDelegationPromptSummary(
  result: ExecutiveDelegationResult,
): ExecutiveDelegationPromptSummary {
  return {
    ownerType: result.ownerType,
    ownerName: result.ownerName ?? null,
    responsibilityReason: result.responsibilityReason,
    delegationAdvice: result.delegationAdvice,
    requiredActionByOwner: result.requiredActionByOwner,
    userShouldDoNow: result.userShouldDoNow,
    riskIfNotAssigned: result.riskIfNotAssigned,
    shouldCreateTask: false,
    confidence: result.confidence,
  };
}
