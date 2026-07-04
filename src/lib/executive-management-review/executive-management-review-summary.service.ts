import type {
  ExecutiveManagementReviewPromptSummary,
  ExecutiveManagementReviewResult,
} from "./executive-management-review.types";

export function buildExecutiveManagementReviewPromptSummary(
  result: ExecutiveManagementReviewResult,
): ExecutiveManagementReviewPromptSummary {
  return {
    reviewType: result.reviewType,
    executiveRead: result.executiveRead,
    mainManagementConcern: result.mainManagementConcern,
    nonNegotiableFocus: result.nonNegotiableFocus,
    leadershipTone: result.leadershipTone,
    userDirection: result.userDirection,
    clarificationNeeded: result.clarificationNeeded,
    shouldChallengeUser: result.shouldChallengeUser,
    shouldProtectUser: result.shouldProtectUser,
    shouldSurfaceToUser: result.shouldSurfaceToUser,
    confidence: result.confidence,
  };
}
