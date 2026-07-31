import type { GenerateAiResponseInput } from "@/lib/ai/ai.types";
import type {
  TextResponseReadiness,
  TextResponseStatusCategory,
} from "./text-response-readiness";

export type ConversationRuntimeProfile = NonNullable<
  GenerateAiResponseInput["contextProfile"]
>;

export type ConversationRuntimeResolution = Readonly<{
  contextProfile: ConversationRuntimeProfile;
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
}): ConversationRuntimeResolution {
  if (input.readiness.mode === "immediate") {
    return {
      contextProfile: "conversational_minimal",
    };
  }

  const category = input.readiness.statusCategory ?? "general_processing";

  return {
    contextProfile: PROFILE_BY_CATEGORY[category],
  };
}
