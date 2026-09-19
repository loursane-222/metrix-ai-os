export type MetrixTrustedToolContext = {
  actorUserId: string;
  organizationId: string;
  idempotencyScope: string;
  timezone: string;
  referenceTimeIso: string;
};

export type ExecutiveToolContext = {
  actorUserId: string;
  organizationId: string;
  turnId: string;
  timezone?: string;
  referenceTimeIso?: string;
};

export type MetrixExecutiveContext = ExecutiveToolContext;

/**
 * Who started the turn. USER (the default) is a person's message in a chat
 * or voice session. SYSTEM_EVENT is a trusted server-originated company
 * event/schedule signal: the same Executive runs, but read-only plus the one
 * notification, with no chat conversation attached. Only server code can
 * set it — no request body carries it.
 */
export type MetrixExecutiveTurnOrigin = "USER" | "SYSTEM_EVENT";

export type MetrixExecutiveTurnInput = {
  actorUserId: string;
  organizationId: string;
  turnId: string;
  message: string;
  timezone?: string;
  referenceTimeIso?: string;
  openAiConversationId?: string;
  origin?: MetrixExecutiveTurnOrigin;
};

export type ExecutiveToolCallCapture = {
  name: string;
  result: unknown;
};

export type MetrixExecutiveTurnResult = {
  finalOutput: string;
  executionItems: unknown[];
  toolCalls: ExecutiveToolCallCapture[];
  capabilityResults: import("./turn-result").CanonicalCapabilityResult[];
  openAiConversationId: string;
};
