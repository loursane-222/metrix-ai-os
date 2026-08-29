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

// Calendar-only navigation refinement. The model extracts an intent keyword
// or explicit day/month numbers — it never computes "today"/"tomorrow" as an
// absolute date itself (that would be fabrication risk: the model has no
// reliable notion of the real current date). Absolute date resolution always
// happens deterministically downstream, from the server's real clock, in
// business-navigation.ts.
export type CalendarViewRequest = "day" | "week" | "month";
export type CalendarDateRequest =
  | { kind: "today" }
  | { kind: "tomorrow" }
  | { kind: "explicit"; day: number; month: number };

export type BusinessNavigationRequest = Readonly<{
  operation: "NAVIGATE";
  domain: "company" | "customer" | "offer" | "product" | "task" | "calendar" | "accounting" | "team" | "report" | "document" | "kpi" | "stock" | "order" | "invoice" | "payment" | "supplier" | "performance";
  target: "root" | "list" | "detail" | "edit" | "create";
  entityReference: string | null;
  calendarView?: CalendarViewRequest | null;
  calendarDate?: CalendarDateRequest | null;
}>;

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
  businessNavigation?: BusinessNavigationRequest | null;
  // User asked to close the currently open Living Workspace surface and
  // return to full-screen chat (e.g. "teklif sayfasını kapat, sohbete dön").
  // Domain-agnostic on purpose: it closes whatever surface is open, it does
  // not open one — that's businessNavigation's job.
  workspaceControl?: "close" | null;
  reasoning: ConversationUnderstandingReasoning;
};

export type ConversationUnderstandingInput = {
  message: string;
  recentMessages?: string[];
};
