import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

describe(
  "safe Live observability",
  () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it(
      "records lifecycle metadata without sensitive payload fields",
      async () => {
        const info =
          vi
            .spyOn(
              console,
              "info"
            )
            .mockImplementation(
              () => undefined
            );

        const {
          recordLiveLifecycle
        } =
          await import(
            "../../src/lib/live/live-observability"
          );

        recordLiveLifecycle({
          bindingId:
            "binding_1",
          openAiSessionId:
            "live_session_1",
          delegationId:
            "delegation_1",
          responseId:
            "response_1",
          callId:
            "call_1",
          phase:
            "FUNCTION_CALL",
          status:
            "COMPLETED",
          timestamp:
            "2026-09-14T07:50:01.000Z"
        });

        expect(
          info
        ).toHaveBeenCalledTimes(1);

        const serialized =
          JSON.stringify(
            info.mock.calls
          );

        for (
          const forbidden
          of [
            "argumentsJson",
            "toolArguments",
            "toolResult",
            "transcript",
            "sdp",
            "OPENAI_API_KEY",
            "authorization",
            "cookie"
          ]
        ) {
          expect(
            serialized
          ).not.toContain(
            forbidden
          );
        }
      }
    );
  }
);
