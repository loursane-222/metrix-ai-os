import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import type {
  ExecutiveBehaviorPlanV1,
  LivingExecutiveSemanticHint,
  LivingExecutiveSemanticIntent,
} from "./contracts";

export function adaptConversationUnderstandingToLivingHint(
  understanding: ConversationUnderstanding,
): LivingExecutiveSemanticHint | null {
  const intent = mapSupportedIntent(understanding);
  return intent ? Object.freeze({ intent, confidence: understanding.confidence }) : null;
}

/** Temporary compatibility projection; the canonical direction is plan → hint. */
export function adaptExecutiveBehaviorPlanToLivingHint(
  plan: ExecutiveBehaviorPlanV1,
): LivingExecutiveSemanticHint | null {
  const intent: LivingExecutiveSemanticIntent | null =
    plan.primaryBehavior === "LISTEN" || plan.primaryBehavior === "SUPPORT"
      ? "social_exchange"
      : plan.primaryBehavior === "GUIDE" || plan.primaryBehavior === "CHALLENGE"
        ? "decision_support"
        : plan.primaryBehavior === "ACT_WITH_USER" || plan.primaryBehavior === "CONFIRM"
          ? "operational_request"
          : plan.primaryBehavior === "EXPLAIN"
            ? "business_context"
            : null;
  return intent
    ? Object.freeze({
        intent,
        confidence: plan.confidence.toLowerCase() as LivingExecutiveSemanticHint["confidence"],
      })
    : null;
}

function mapSupportedIntent(
  understanding: ConversationUnderstanding,
): LivingExecutiveSemanticIntent | null {
  switch (understanding.userMotivation) {
    case "sohbet_etmek":
      return understanding.conversationKind === "general_chat" ? "social_exchange" : null;
    case "karar_destegi":
      return "decision_support";
    case "kayit_islem":
      return understanding.actionExpectation !== "none" ? "operational_request" : null;
    case "bilgi_almak":
    case "planlama":
      return understanding.conversationKind === "company_related" &&
        (understanding.companyRelevance === "medium" || understanding.companyRelevance === "high")
        ? "business_context"
        : null;
    case "belirsiz":
      return null;
  }
}
