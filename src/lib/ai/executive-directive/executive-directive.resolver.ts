import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import type { ExecutiveAssessment } from "@/lib/executive-brain/executive-brain.types";
import type { ExecutiveDirectiveV1 } from "./contracts";

export type ResolveExecutiveDirectiveInput = Readonly<{
  understanding: ConversationUnderstanding;
  assessment?: ExecutiveAssessment | null;
}>;

/**
 * Pure deterministic projection. Assessment may constrain an intervention,
 * but never creates intent, selects a capability/tool, or invokes execution.
 */
export function resolveExecutiveDirective(
  input: ResolveExecutiveDirectiveInput,
): ExecutiveDirectiveV1 {
  const { understanding, assessment = null } = input;
  const needsClarification =
    understanding.shouldAskClarification
    || understanding.suggestedHandling === "ask_clarification";
  const explicitAction =
    understanding.actionExpectation === "explicit"
    || understanding.userMotivation === "kayit_islem";
  const needsAnalysis =
    understanding.userMotivation === "karar_destegi"
    || understanding.suggestedHandling === "executive_reasoning";
  const assessmentHasHighFinding =
    assessment?.findings.some((finding) => finding.severity === "HIGH") === true;

  return Object.freeze({
    schemaVersion: "1.0",
    source: assessment
      ? "conversation_understanding_and_assessment"
      : "conversation_understanding",
    primaryIntent: understanding.userMotivation,
    interventionLevel: understanding.suggestedHandling,
    authorityMode: needsClarification
      ? "CLARIFICATION"
      : explicitAction
        ? "DRAFT"
        : needsAnalysis || assessmentHasHighFinding
          ? "READ_ONLY"
          : understanding.suggestedHandling === "passive_note"
            ? "DEFERRED"
            : "RESPONSE_ONLY",
    actionStrategy: needsClarification
      ? null
      : explicitAction
        ? "WORKFLOW"
        : needsAnalysis || assessmentHasHighFinding
          ? "ANALYZE"
          : understanding.userMotivation === "bilgi_almak"
            ? "READ"
            : "ANSWER",
    confirmationPolicy: explicitAction ? "CONFIRM_BEFORE_ACTION" : "NONE",
    reasoningMode: assessment ? "ASSESSMENT_INFORMED" : "DETERMINISTIC",
    requiresExecutiveReasoning: understanding.shouldInvokeExecutiveBrain,
    confidence: understanding.confidence,
  });
}
