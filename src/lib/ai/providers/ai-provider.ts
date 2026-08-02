import type { MemoryContext } from "@/lib/memory/memory-context.types";

export type AiProviderName = "mock" | "openai";

export type AiProviderRequestMetadata = {
  organizationId?: string;
  conversationId?: string;
  userId?: string;
  requestId?: string;
};

export type AiProviderUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ConversationHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

export type GenerateResponseInput = {
  systemPrompt: string;
  userMessage: string;
  context: MemoryContext;
  metadata?: AiProviderRequestMetadata;
  // Prior turns of this same conversation, oldest first, not including
  // userMessage. Without this the provider call is stateless per-turn — the
  // model has no way to recall its own or the user's previous statements.
  history?: ConversationHistoryTurn[];
};

export type GenerateResponseResult = {
  content: string;
  model: string;
  provider: AiProviderName;
  usage?: AiProviderUsage;
  rawResponseId?: string;
};

export interface AiProvider {
  readonly name: AiProviderName;

  generateResponse(
    input: GenerateResponseInput,
  ): Promise<GenerateResponseResult>;
}

export class AiProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderConfigurationError";
  }
}

export class AiProviderRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderRequestError";
  }
}
