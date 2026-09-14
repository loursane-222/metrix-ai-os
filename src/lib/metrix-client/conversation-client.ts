// Minimal headless client-side contract for /api/metrix text turns. No
// rendering, no page — the same "pure state module beside a thin visual
// component" split already used by voice-session-client-state.ts. A real
// text UI, when one exists, wires its input box to buildMetrixTurnRequestBody
// and its response handler to applyMetrixTurnResponse; neither function
// knows anything about React, fetch, or the DOM.
//
// conversationId is the server's opaque local ExecutiveConversation id —
// never the raw OpenAI conversation id, never actorUserId/organizationId.

export type MetrixConversationState = {
  conversationId: string | null;
};

export const initialMetrixConversationState: MetrixConversationState =
  {
    conversationId: null
  };

export type MetrixTurnRequestBody = {
  message: string;
  turnId: string;
  conversationId?: string;
};

export function buildMetrixTurnRequestBody(
  input: {
    message: string;
    turnId: string;
    state: MetrixConversationState;
  }
): MetrixTurnRequestBody {
  return {
    message: input.message,
    turnId: input.turnId,
    ...(input.state.conversationId
      ? {
          conversationId:
            input.state.conversationId
        }
      : {})
  };
}

export type MetrixTurnResponseBody =
  | {
      ok: true;
      finalOutput: string;
      executionItems: unknown[];
      conversationId: string;
    }
  | {
      ok: false;
      code: string;
    };

/**
 * Applies a /api/metrix response to conversation state. A failed turn
 * (ok: false — auth failure, invalid/foreign conversation handle,
 * validation error, etc.) never overwrites the existing handle: the
 * client keeps whatever it already had, including null, so one bad
 * response can never silently orphan or hijack the conversation.
 */
export function applyMetrixTurnResponse(
  input: {
    state: MetrixConversationState;
    response: MetrixTurnResponseBody;
  }
): MetrixConversationState {
  if (!input.response.ok) {
    return input.state;
  }

  return {
    conversationId:
      input.response.conversationId
  };
}

/**
 * Starts a brand-new conversation: the same "new conversation" reset a
 * real UI's own new-chat action would perform. Task 13 does not add
 * that UI interaction; this only gives it a single, correct place to
 * call when it exists.
 */
export function resetMetrixConversationState(): MetrixConversationState {
  return initialMetrixConversationState;
}
