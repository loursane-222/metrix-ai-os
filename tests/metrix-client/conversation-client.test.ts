import {
  describe,
  expect,
  it
} from "vitest";

import {
  applyMetrixTurnResponse,
  buildMetrixTurnRequestBody,
  initialMetrixConversationState,
  resetMetrixConversationState
} from "../../src/lib/metrix-client/conversation-client";

describe(
  "METRIX text client conversation contract",
  () => {
    it(
      "Turn 1 request carries no conversationId when state starts fresh",
      () => {
        const body = buildMetrixTurnRequestBody({
          message: "Merhaba",
          turnId: "turn-1",
          state: initialMetrixConversationState
        });

        expect(body).toEqual({
          message: "Merhaba",
          turnId: "turn-1"
        });

        expect(
          Object.prototype.hasOwnProperty.call(
            body,
            "conversationId"
          )
        ).toBe(false);
      }
    );

    it(
      "a successful Turn 1 response stores the server-returned opaque conversationId",
      () => {
        const nextState = applyMetrixTurnResponse({
          state: initialMetrixConversationState,
          response: {
            ok: true,
            finalOutput: "Teklif oluşturuldu.",
            executionItems: [],
            conversationId: "local-conversation-1"
          }
        });

        expect(nextState).toEqual({
          conversationId: "local-conversation-1"
        });
      }
    );

    it(
      "Turn 2 request carries the SAME conversationId with a DIFFERENT turnId",
      () => {
        const stateAfterTurn1 = {
          conversationId: "local-conversation-1"
        };

        const turn2Body = buildMetrixTurnRequestBody({
          message:
            "Bu teklifte miktarı 3 yap ve %10 satır indirimi uygula.",
          turnId: "turn-2",
          state: stateAfterTurn1
        });

        expect(turn2Body).toEqual({
          message:
            "Bu teklifte miktarı 3 yap ve %10 satır indirimi uygula.",
          turnId: "turn-2",
          conversationId: "local-conversation-1"
        });

        expect(turn2Body.turnId).not.toBe("turn-1");
        expect(turn2Body.conversationId).toBe(
          "local-conversation-1"
        );
      }
    );

    it(
      "conversationId and turnId are never derived from one another across two real turns",
      () => {
        let state = initialMetrixConversationState;

        const turn1Body = buildMetrixTurnRequestBody({
          message: "İlk mesaj",
          turnId: "turn-a",
          state
        });

        state = applyMetrixTurnResponse({
          state,
          response: {
            ok: true,
            finalOutput: "Tamam.",
            executionItems: [],
            conversationId: "conv-x"
          }
        });

        const turn2Body = buildMetrixTurnRequestBody({
          message: "İkinci mesaj",
          turnId: "turn-b",
          state
        });

        expect(turn1Body.turnId).toBe("turn-a");
        expect(turn2Body.turnId).toBe("turn-b");
        expect(turn2Body.conversationId).toBe("conv-x");
        // the two turnIds are unrelated to the conversationId value
        expect(turn1Body.turnId).not.toBe(
          turn2Body.conversationId
        );
        expect(turn2Body.turnId).not.toBe(
          turn2Body.conversationId
        );
      }
    );

    it(
      "a failed response never overwrites an existing conversationId",
      () => {
        const stateWithHandle = {
          conversationId: "local-conversation-1"
        };

        const afterFailure = applyMetrixTurnResponse({
          state: stateWithHandle,
          response: {
            ok: false,
            code: "CONVERSATION_NOT_FOUND"
          }
        });

        expect(afterFailure).toEqual(
          stateWithHandle
        );

        expect(afterFailure).not.toBeNull();
      }
    );

    it(
      "a failed response never overwrites a still-fresh (null) conversationId",
      () => {
        const afterFailure = applyMetrixTurnResponse({
          state: initialMetrixConversationState,
          response: {
            ok: false,
            code: "UNAUTHENTICATED"
          }
        });

        expect(afterFailure).toEqual({
          conversationId: null
        });
      }
    );

    it(
      "a failure payload can never smuggle a conversationId into client state, even if malformed",
      () => {
        const stateWithHandle = {
          conversationId: "local-conversation-1"
        };

        const malformedFailure = {
          ok: false,
          code: "SOME_ERROR",
          // a server bug or hostile response should not be able to
          // inject a foreign conversationId through the failure branch
          conversationId: "attacker-conversation"
        } as const;

        const afterFailure = applyMetrixTurnResponse({
          state: stateWithHandle,
          response: malformedFailure
        });

        expect(afterFailure.conversationId).toBe(
          "local-conversation-1"
        );

        expect(
          afterFailure.conversationId
        ).not.toBe("attacker-conversation");
      }
    );

    it(
      "resetMetrixConversationState returns to the fresh, handle-less state",
      () => {
        expect(
          resetMetrixConversationState()
        ).toEqual({ conversationId: null });
      }
    );

    it(
      "never carries actorUserId or organizationId in the request body shape",
      () => {
        const body = buildMetrixTurnRequestBody({
          message: "Merhaba",
          turnId: "turn-1",
          state: {
            conversationId: "local-conversation-1"
          }
        });

        expect(
          JSON.stringify(body)
        ).not.toMatch(
          /actorUserId|organizationId|idempotencyScope/
        );
      }
    );
  }
);
