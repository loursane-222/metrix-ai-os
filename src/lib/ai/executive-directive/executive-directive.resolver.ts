import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import {
  projectExecutiveAssessmentToDirectiveSignals,
  type ExecutiveAssessmentV1,
} from "@/lib/executive-assessment";
import type {
  ExecutiveDecisionCalibrationV1,
  ExecutiveDirectiveV1,
} from "./contracts";

export type ResolveExecutiveDirectiveInput = Readonly<{
  understanding: ConversationUnderstanding;
  assessment?: ExecutiveAssessmentV1 | null;
  decisionCalibration?: ExecutiveDecisionCalibrationV1 | null;
}>;

/**
 * Pure deterministic projection. Assessment may constrain an intervention,
 * but never creates intent, selects a capability/tool, or invokes execution.
 */
export function resolveExecutiveDirective(
  input: ResolveExecutiveDirectiveInput,
): ExecutiveDirectiveV1 {
  const { understanding, assessment = null, decisionCalibration = null } = input;
  const needsClarification =
    understanding.shouldAskClarification
    || understanding.suggestedHandling === "ask_clarification";
  const explicitAction =
    understanding.actionExpectation === "explicit"
    || understanding.userMotivation === "kayit_islem";
  const needsAnalysis =
    understanding.userMotivation === "karar_destegi"
    || understanding.suggestedHandling === "executive_reasoning";
  const assessmentSignals = assessment
    ? projectExecutiveAssessmentToDirectiveSignals(assessment)
    : null;
  const assessmentAvailable =
    assessmentSignals !== null && assessmentSignals.status !== "UNAVAILABLE";
  const assessmentHasHighRisk =
    assessmentSignals?.highestRisk === "HIGH"
    || assessmentSignals?.highestRisk === "CRITICAL";
  const assessmentNeedsClarification =
    assessmentSignals?.status === "PARTIAL"
    && assessmentSignals.hasEvidenceGaps
    && (needsAnalysis || understanding.shouldInvokeExecutiveBrain);
  const directiveConfidence =
    assessmentAvailable && assessmentSignals.confidence === "LOW"
      ? "low"
      : assessmentAvailable
        && assessmentSignals.confidence === "MEDIUM"
        && understanding.confidence === "high"
          ? "medium"
          : understanding.confidence;

  return Object.freeze({
    schemaVersion: "1.0",
    source: assessmentAvailable
      ? "conversation_understanding_and_assessment"
      : "conversation_understanding",
    primaryIntent: understanding.userMotivation,
    interventionLevel: understanding.suggestedHandling,
    authorityMode: needsClarification || assessmentNeedsClarification
      ? "CLARIFICATION"
      : explicitAction
        ? "DRAFT"
        : needsAnalysis || assessmentHasHighRisk
          ? "READ_ONLY"
          : understanding.suggestedHandling === "passive_note"
            ? "DEFERRED"
            : "RESPONSE_ONLY",
    actionStrategy: needsClarification || assessmentNeedsClarification
      ? null
      : explicitAction
        ? "WORKFLOW"
        : needsAnalysis || assessmentHasHighRisk
          ? "ANALYZE"
          : understanding.userMotivation === "bilgi_almak"
            ? "READ"
            : "ANSWER",
    confirmationPolicy: explicitAction ? "CONFIRM_BEFORE_ACTION" : "NONE",
    reasoningMode: assessmentAvailable ? "ASSESSMENT_INFORMED" : "DETERMINISTIC",
    requiresExecutiveReasoning: understanding.shouldInvokeExecutiveBrain,
    confidence: directiveConfidence,
    decisionCalibration,
  });
}
