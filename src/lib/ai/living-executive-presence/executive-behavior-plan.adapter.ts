import type { ExecutiveDirectiveV1 } from "@/lib/ai/executive-directive";
import type { ExecutiveBehaviorPlanV1 } from "./contracts";

/**
 * Pure adapter only: Directive remains the orchestrator authority.
 * This layer creates behavior, never intent, tools/actions, or answer text.
 */
export function adaptExecutiveDirectiveToExecutiveBehaviorPlan(
  directive: ExecutiveDirectiveV1,
): ExecutiveBehaviorPlanV1 {
  const needsClarification =
    directive.authorityMode === "CLARIFICATION"
    || directive.interventionLevel === "ask_clarification";
  const isAction = directive.actionStrategy === "WORKFLOW";
  const isDecision =
    directive.primaryIntent === "karar_destegi"
    || directive.interventionLevel === "executive_reasoning";
  const mustProtect = isAction && directive.requiresExecutiveReasoning;
  const isWaiting =
    directive.authorityMode === "DEFERRED"
    || directive.interventionLevel === "passive_note";
  const mustChallenge = isDecision && directive.requiresExecutiveReasoning;

  return Object.freeze({
    schemaVersion: "1.0",
    source: "executive_directive",
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
                : directive.primaryIntent === "sohbet_etmek"
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
              : directive.primaryIntent === "sohbet_etmek"
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
        : directive.primaryIntent === "planlama"
          ? "STEPWISE"
          : directive.primaryIntent === "sohbet_etmek"
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
            : directive.primaryIntent === "sohbet_etmek"
              ? "IMMEDIATE"
              : "CONCISE",
    requiresExecutiveReasoning: directive.requiresExecutiveReasoning,
    confidence: directive.confidence.toUpperCase() as ExecutiveBehaviorPlanV1["confidence"],
  });
}
