import {
  describe,
  expect,
  it,
  vi
} from "vitest";

const mocks =
  vi.hoisted(() => ({
    run: vi.fn()
  }));

vi.mock(
  "@openai/agents",
  async () => {
    const actual =
      await vi.importActual<
        typeof import("@openai/agents")
      >("@openai/agents");

    return {
      ...actual,
      run: mocks.run
    };
  }
);

describe(
  "runMetrixExecutiveTurn native Session wiring",
  () => {
    it(
      "passes a real OpenAIConversationsSession instance to run() and threads a given native conversation id straight through with no history-writing side effects",
      async () => {
        mocks.run
          .mockReset()
          .mockResolvedValue({
            finalOutput: "Tamam.",
            newItems: []
          });

        const {
          runMetrixExecutiveTurn
        } = await import(
          "../../src/lib/agent/metrix-executive-agent"
        );

        const {
          OpenAIConversationsSession
        } = await import("@openai/agents");

        const result =
          await runMetrixExecutiveTurn({
            actorUserId: "user-1",
            organizationId: "org-1",
            turnId: "turn-1",
            message: "Merhaba",
            openAiConversationId:
              "conv_existing_abc"
          });

        expect(mocks.run).toHaveBeenCalledTimes(
          1
        );

        const [
          calledAgent,
          calledInput,
          calledOptions
        ] = mocks.run.mock.calls[0] as [
          unknown,
          unknown,
          {
            session?: unknown;
            context?: unknown;
          }
        ];

        expect(calledInput).toBe("Merhaba");

        expect(
          calledOptions.session
        ).toBeInstanceOf(
          OpenAIConversationsSession
        );

        expect(
          (
            calledOptions.session as InstanceType<
              typeof OpenAIConversationsSession
            >
          ).sessionId
        ).toBe("conv_existing_abc");

        expect(
          calledOptions.context
        ).toMatchObject({
          actorUserId: "user-1",
          organizationId: "org-1",
          turnId: "turn-1"
        });

        expect(
          calledOptions.context
        ).not.toHaveProperty(
          "openAiConversationId"
        );

        expect(
          result.openAiConversationId
        ).toBe("conv_existing_abc");

        expect(
          (calledAgent as { name?: string })
            ?.name
        ).toBe("METRIX");
      }
    );

    it(
      "constructs a fresh Session with no conversation id when none is given (first turn)",
      async () => {
        mocks.run
          .mockReset()
          .mockResolvedValue({
            finalOutput: "Tamam.",
            newItems: []
          });

        const {
          runMetrixExecutiveTurn
        } = await import(
          "../../src/lib/agent/metrix-executive-agent"
        );

        const {
          OpenAIConversationsSession
        } = await import("@openai/agents");

        // The lazy-create path inside a bare OpenAIConversationsSession
        // would otherwise make a real network call on getSessionId();
        // stub it here purely to keep this a network-free unit test.
        const getSessionIdSpy = vi
          .spyOn(
            OpenAIConversationsSession.prototype,
            "getSessionId"
          )
          .mockResolvedValue(
            "conv_freshly_created"
          );

        try {
          const result =
            await runMetrixExecutiveTurn({
              actorUserId: "user-1",
              organizationId: "org-1",
              turnId: "turn-2",
              message: "Merhaba"
            });

          const [, , calledOptions] =
            mocks.run.mock.calls[0] as [
              unknown,
              unknown,
              { session?: unknown }
            ];

          const session =
            calledOptions.session as InstanceType<
              typeof OpenAIConversationsSession
            >;

          expect(session).toBeInstanceOf(
            OpenAIConversationsSession
          );

          expect(session.sessionId).toBeUndefined();

          expect(
            result.openAiConversationId
          ).toBe("conv_freshly_created");
        } finally {
          getSessionIdSpy.mockRestore();
        }
      }
    );
  }
);
