export type ConversationKind =
  | "general_chat"
  | "company_related"
  | "mixed"
  | "unclear";

export type UserMotivation =
  | "bilgi_almak"
  | "sohbet_etmek"
  | "karar_destegi"
  | "kayit_islem"
  | "planlama"
  | "belirsiz";

export type CompanyRelevance = "none" | "low" | "medium" | "high";

export type ActionExpectation = "none" | "possible" | "explicit";

export type ConfidenceLevel = "low" | "medium" | "high";

export type SuggestedHandling =
  | "answer_only"
  | "ask_clarification"
  | "executive_reasoning"
  | "passive_note";

export type ConversationUnderstandingReasoning = {
  summary: string;
  observations: string[];
  uncertainty: string[];
  whyThisHandling: string;
};

export type ConversationUnderstanding = {
  conversationKind: ConversationKind;
  userMotivation: UserMotivation;
  companyRelevance: CompanyRelevance;
  actionExpectation: ActionExpectation;
  confidence: ConfidenceLevel;
  shouldAskClarification: boolean;
  clarificationQuestion?: string;
  shouldInvokeExecutiveBrain: boolean;
  suggestedHandling: SuggestedHandling;
  reasoning: ConversationUnderstandingReasoning;
};

export type ConversationUnderstandingInput = {
  message: string;
  recentMessages?: string[];
};
