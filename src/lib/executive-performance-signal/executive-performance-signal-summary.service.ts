import type {
  ExecutivePerformanceSignalPromptSummary,
  ExecutivePerformanceSignalResult,
} from "./executive-performance-signal.types";

export function buildExecutivePerformanceSignalPromptSummary(
  result: ExecutivePerformanceSignalResult,
): ExecutivePerformanceSignalPromptSummary {
  const primarySignal = result.primarySignal
    ? {
        priority: result.primarySignal.priority,
        subject: result.primarySignal.subject,
        ownerName: result.primarySignal.ownerName ?? null,
        title: result.primarySignal.title,
        reason: result.primarySignal.reason,
        suggestedResponseBehavior: result.primarySignal.suggestedResponseBehavior,
      }
    : null;

  return {
    primarySignal,
    managementConcern: result.managementConcern,
    recommendedManagementMove: result.recommendedManagementMove,
    userProtectionInstruction: result.userProtectionInstruction,
    shouldSurfaceToUser: result.shouldSurfaceToUser,
    confidence: result.confidence,
  };
}
