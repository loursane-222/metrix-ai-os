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

export type MetrixExecutiveTurnInput = {
  actorUserId: string;
  organizationId: string;
  turnId: string;
  message: string;
  timezone?: string;
  referenceTimeIso?: string;
  openAiConversationId?: string;
};

export type MetrixExecutiveTurnResult = {
  finalOutput: string;
  executionItems: unknown[];
  openAiConversationId: string;
};
