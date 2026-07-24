import type { GenerateAiResponseInput } from "@/lib/ai/ai.types";
import type { ConversationUnderstanding } from "./conversation-understanding.types";
import type {
  TextResponseReadiness,
  TextResponseStatusCategory,
} from "./text-response-readiness";

export type ConversationRuntimeProfile = NonNullable<
  GenerateAiResponseInput["contextProfile"]
>;

export type ConversationRuntimeResolution = Readonly<{
  contextProfile: ConversationRuntimeProfile;
  understanding: ConversationUnderstanding;
}>;

const PROFILE_BY_CATEGORY: Record<
  TextResponseStatusCategory,
  ConversationRuntimeProfile
> = {
  executive_analysis: "executive_analysis",
  data_lookup: "business_light",
  customer_context: "business_light",
  document_review: "business_light",
  action_validation: "action_execution",
  general_processing: "business_light",
};

export function resolveConversationRuntime(input: {
  readiness: TextResponseReadiness;
  fastPathUnderstanding?: ConversationUnderstanding | null;
}): ConversationRuntimeResolution {
  if (input.readiness.mode === "immediate" && input.fastPathUnderstanding) {
    return {
      contextProfile: "conversational_minimal",
      understanding: input.fastPathUnderstanding,
    };
  }

  const category = input.readiness.statusCategory ?? "general_processing";
  const isAction = category === "action_validation";
  const isExecutive = category === "executive_analysis" || isAction;

  return {
    contextProfile: PROFILE_BY_CATEGORY[category],
    understanding: {
      conversationKind:
        category === "general_processing" ? "unclear" : "company_related",
      userMotivation: isAction
        ? "kayit_islem"
        : isExecutive
          ? "karar_destegi"
          : "bilgi_almak",
      companyRelevance:
        category === "general_processing" ? "low" : isExecutive ? "high" : "medium",
      actionExpectation: isAction ? "explicit" : "none",
      confidence: isAction || isExecutive ? "high" : "medium",
      shouldAskClarification: false,
      shouldInvokeExecutiveBrain: isExecutive,
      suggestedHandling: isExecutive ? "executive_reasoning" : "answer_only",
      reasoning: {
        summary: `Deterministic conversation-first routing: ${category}.`,
        observations: [],
        uncertainty: [],
        whyThisHandling:
          "Final response routing uses the existing deterministic readiness contract; deep classification runs outside the first-token path.",
      },
    },
  };
}
