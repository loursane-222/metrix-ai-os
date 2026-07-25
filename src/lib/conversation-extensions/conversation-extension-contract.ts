export type ConversationExtensionSource = "written" | "voice";

import type { ConversationExtensionHandoff } from "./conversation-extension-handoff";

export type ConversationExtensionStatus = "NOT_HANDLED" | "HANDOFF";

export type ConversationExtensionResult = {
  status: ConversationExtensionStatus;
  handoff: ConversationExtensionHandoff | null;
  duplicate: boolean;
};

export type ConversationExtensionRequest = {
  utterance: string;
  source: ConversationExtensionSource;
  turnKey?: string;
  correlationId?: string;
};

export type ConversationExtension = {
  getActiveScopeKey(): string | null;
  execute(utterance: string, source?: ConversationExtensionSource, correlationId?: string): Promise<Omit<ConversationExtensionResult, "duplicate">>;
  reset?(): void;
};
