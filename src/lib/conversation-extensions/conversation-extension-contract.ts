export type ConversationExtensionSource = "written" | "voice";

export type ConversationExtensionStatus =
  | "NOT_HANDLED"
  | "HANDLED_EXECUTED"
  | "HANDLED_CLARIFICATION"
  | "HANDLED_FAILED";

export type ConversationExtensionResult = {
  status: ConversationExtensionStatus;
  message: string | null;
  duplicate: boolean;
};

export type ConversationExtensionRequest = {
  utterance: string;
  source: ConversationExtensionSource;
  turnKey?: string;
};

export type ConversationExtension = {
  getActiveScopeKey(): string | null;
  execute(utterance: string, source?: ConversationExtensionSource): Promise<Omit<ConversationExtensionResult, "duplicate">>;
};
