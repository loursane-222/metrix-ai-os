export type {
  ConversationPhase,
  ExecutiveConversationState,
} from "@/lib/ai/executive-conversation.types";

export type ConversationSignalType =
  | "ACCEPTANCE"
  | "REJECTION"
  | "UNCERTAINTY"
  | "COMMITMENT"
  | "NEW_INFORMATION"
  | "OPEN_ENDED";
