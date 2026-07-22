export type OpeningMessage = { role: "metrix" | "user"; content: string };

export type ConversationSessionBootstrapDecision = {
  clearStoredConversation: boolean;
  restoreConversationId: string | null;
  initialMessages: OpeningMessage[] | null;
};

export function decideConversationSessionBootstrap(params: {
  previousAuthSessionId: string | null;
  authSessionId: string;
  storedConversationId: string | null;
  firstExperienceActive: boolean;
  firstExperienceConversationId: string | null;
  firstExperienceMessages: OpeningMessage[];
  dailyBrief: { content: string } | null;
  greeting: OpeningMessage;
}): ConversationSessionBootstrapDecision {
  const isNewAuthenticationSession = params.previousAuthSessionId !== params.authSessionId;
  if (isNewAuthenticationSession) {
    return {
      clearStoredConversation: true,
      restoreConversationId: null,
      initialMessages: params.dailyBrief
        ? [{ role: "metrix", content: `Bugünün öncelikleri\n\n${params.dailyBrief.content}` }]
        : [params.greeting],
    };
  }

  if (params.storedConversationId) {
    return {
      clearStoredConversation: false,
      restoreConversationId: params.storedConversationId,
      initialMessages: null,
    };
  }

  if (
    params.firstExperienceActive
    && params.firstExperienceConversationId
    && params.firstExperienceMessages.length > 0
  ) {
    return {
      clearStoredConversation: false,
      restoreConversationId: params.firstExperienceConversationId,
      initialMessages: params.firstExperienceMessages,
    };
  }

  return {
    clearStoredConversation: false,
    restoreConversationId: null,
    initialMessages: [params.greeting],
  };
}
