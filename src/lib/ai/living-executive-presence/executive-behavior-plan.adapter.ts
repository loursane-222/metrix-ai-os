import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import type { ExecutiveBehaviorPlanV1 } from "./contracts";

/**
 * Pure adapter only: Conversation Understanding remains the intent authority.
 * No tool/action type or answer text may be added to this contract.
 */
export function adaptConversationUnderstandingToExecutiveBehaviorPlan(
  understanding: ConversationUnderstanding,
): ExecutiveBehaviorPlanV1 {
  const needsClarification =
    understanding.shouldAskClarification
    || understanding.suggestedHandling === "ask_clarification";
  const isAction = understanding.actionExpectation !== "none";
  const isDecision =
    understanding.userMotivation === "karar_destegi"
    || understanding.suggestedHandling === "executive_reasoning";
  const mustProtect = isAction && understanding.shouldInvokeExecutiveBrain;
  const isWaiting =
    understanding.actionExpectation === "possible"
    && understanding.suggestedHandling === "passive_note";
  const mustChallenge = isDecision && understanding.shouldInvokeExecutiveBrain;

  return Object.freeze({
    schemaVersion: "1.0",
    source: "conversation_understanding",
    primaryBehavior: mustProtect
      ? "PROTECT"
      : needsClarification
      ? "CLARIFY"
      : isWaiting
        ? "WAIT"
      : isAction
        ? "ACT_WITH_USER"
        : mustChallenge
          ? "CHALLENGE"
        : isDecision
          ? "GUIDE"
          : understanding.userMotivation === "sohbet_etmek"
            ? "LISTEN"
            : "EXPLAIN",
    interactionPosture: mustProtect
      ? "PROTECTIVE"
      : needsClarification
      ? "CURIOUS"
      : isWaiting
        ? "CALM"
      : isAction
        ? "ACCOUNTABLE"
        : isDecision
          ? "FIRM"
          : understanding.userMotivation === "sohbet_etmek"
            ? "SUPPORTIVE"
            : "DIRECT",
    questionPolicy: mustProtect
      ? "CONFIRM_UNDERSTANDING"
      : needsClarification
      ? "SINGLE_NECESSARY_QUESTION"
      : isAction
        ? "CONFIRM_UNDERSTANDING"
        : isDecision
          ? "DECISION_QUESTION"
          : "NONE",
    explanationPolicy: mustProtect
      ? "BRIEF"
      : isDecision
      ? "COMPARATIVE"
      : understanding.userMotivation === "planlama"
        ? "STEPWISE"
        : understanding.userMotivation === "sohbet_etmek"
          ? "NONE"
          : "FOCUSED",
    challengePolicy: mustProtect
      ? "BLOCK_UNSAFE_ACTION"
      : mustChallenge
        ? "CLEAR_DISAGREEMENT"
        : isDecision
          ? "GENTLE_ALTERNATIVE"
          : "NONE",
    pacingIntent: mustProtect
      ? "MEASURED"
      : needsClarification
      ? "MEASURED"
      : isWaiting
        ? "WAITING"
      : isDecision
        ? "DELIBERATE"
        : understanding.userMotivation === "sohbet_etmek"
          ? "IMMEDIATE"
          : "CONCISE",
    requiresExecutiveReasoning: understanding.shouldInvokeExecutiveBrain,
    confidence: understanding.confidence.toUpperCase() as ExecutiveBehaviorPlanV1["confidence"],
  });
}
