import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import type { LivingExecutiveSemanticHint, LivingExecutiveSemanticIntent } from "./contracts";

export function adaptConversationUnderstandingToLivingHint(
  understanding: ConversationUnderstanding,
): LivingExecutiveSemanticHint | null {
  const intent = mapSupportedIntent(understanding);
  return intent ? Object.freeze({ intent, confidence: understanding.confidence }) : null;
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
