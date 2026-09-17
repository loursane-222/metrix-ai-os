import {
  describe,
  expect,
  it
} from "vitest";

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError
} from "openai";

import {
  MaxTurnsExceededError,
  ModelTimeoutError,
  ToolCallError,
  UserError
} from "@openai/agents";

import {
  classifyExecutiveTurnFailure
} from "../../src/lib/live/live-delegation-bridge";

describe(
  "classifyExecutiveTurnFailure — sanitized, class-based failure classification",
  () => {
    it(
      "classifies a rate-limit OpenAI API error by status/type/code, never by message",
      () => {
        const error = APIError.generate(
          429,
          {
            error: {
              type: "rate_limit_error",
              code: "rate_limit_exceeded",
              message: "You have hit the customer-specific rate limit for org acme, retry after 3s"
            }
          },
          "rate limited",
          new Headers()
        );

        const classification =
          classifyExecutiveTurnFailure(error);

        expect(classification).toEqual({
          errorClass: "RateLimitError",
          errorType: "rate_limit_error",
          errorCode: "rate_limit_exceeded",
          errorStatus: 429,
          errorCategory: "RATE_LIMIT"
        });

        expect(
          JSON.stringify(classification)
        ).not.toMatch(
          /acme|retry after|rate limit for/i
        );
      }
    );

    it(
      "classifies an auth error and a bad-request error correctly",
      () => {
        const authError = APIError.generate(
          401,
          { error: { type: "invalid_request_error", code: "invalid_api_key" } },
          "unauthorized",
          new Headers()
        );

        expect(
          classifyExecutiveTurnFailure(authError)
        ).toMatchObject({
          errorClass: "AuthenticationError",
          errorStatus: 401,
          errorCategory: "AUTH"
        });

        const badRequest = APIError.generate(
          400,
          { error: { type: "invalid_request_error" } },
          "bad request",
          new Headers()
        );

        expect(
          classifyExecutiveTurnFailure(badRequest)
        ).toMatchObject({
          errorClass: "BadRequestError",
          errorStatus: 400,
          errorCategory: "BAD_REQUEST"
        });
      }
    );

    it(
      "classifies a network/connection-timeout error without a status",
      () => {
        const timeout =
          new APIConnectionTimeoutError();

        expect(
          classifyExecutiveTurnFailure(timeout)
        ).toMatchObject({
          errorClass: "APIConnectionTimeoutError",
          errorCategory: "TIMEOUT"
        });

        const connection =
          new APIConnectionError({
            message: "network unreachable"
          });

        expect(
          classifyExecutiveTurnFailure(connection)
        ).toMatchObject({
          errorClass: "APIConnectionError",
          errorCategory: "NETWORK"
        });
      }
    );

    it(
      "classifies an Agents SDK model timeout and max-turns-exceeded error",
      () => {
        const modelTimeout =
          new ModelTimeoutError({
            timeoutMs: 30_000
          });

        expect(
          classifyExecutiveTurnFailure(modelTimeout)
        ).toEqual({
          errorClass: "ModelTimeoutError",
          errorCategory: "TIMEOUT"
        });

        const maxTurns =
          new MaxTurnsExceededError(
            "Max turns exceeded"
          );

        expect(
          classifyExecutiveTurnFailure(maxTurns)
        ).toEqual({
          errorClass: "MaxTurnsExceededError",
          errorCategory: "MAX_TURNS_EXCEEDED"
        });
      }
    );

    it(
      "drills one level into a wrapped ToolCallError to classify the underlying OpenAI API error",
      () => {
        const underlying = APIError.generate(
          503,
          { error: { type: "server_error" } },
          "service unavailable",
          new Headers()
        );

        const wrapped = new ToolCallError(
          "Tool call failed",
          underlying
        );

        expect(
          classifyExecutiveTurnFailure(wrapped)
        ).toMatchObject({
          // errorClass reflects the OUTER thrown error — the wrapper —
          // since that is what runMetrixExecutiveTurn actually threw.
          errorClass: "ToolCallError",
          errorStatus: 503,
          errorType: "server_error",
          errorCategory: "SERVER_ERROR"
        });
      }
    );

    it(
      "falls back to TOOL_EXECUTION when a ToolCallError wraps a non-API error",
      () => {
        const wrapped = new ToolCallError(
          "Tool call failed",
          new Error("some internal tool error")
        );

        expect(
          classifyExecutiveTurnFailure(wrapped)
        ).toEqual({
          errorClass: "ToolCallError",
          errorCategory: "TOOL_EXECUTION"
        });
      }
    );

    it(
      "classifies an unmatched AgentsError subclass as the generic AGENTS_SDK_ERROR bucket",
      () => {
        const error = new UserError(
          "Some Agents SDK user configuration error"
        );

        expect(
          classifyExecutiveTurnFailure(error)
        ).toEqual({
          errorClass: "UserError",
          errorCategory: "AGENTS_SDK_ERROR"
        });
      }
    );

    it(
      "classifies a plain, unrelated JS error as UNKNOWN, keeping only its class name",
      () => {
        expect(
          classifyExecutiveTurnFailure(
            new TypeError("some plain error")
          )
        ).toEqual({
          errorClass: "TypeError",
          errorCategory: "UNKNOWN"
        });
      }
    );

    it(
      "classifies a non-Error thrown value without crashing",
      () => {
        expect(
          classifyExecutiveTurnFailure("a thrown string")
        ).toEqual({
          errorClass: "string",
          errorCategory: "UNKNOWN"
        });

        expect(
          classifyExecutiveTurnFailure(undefined)
        ).toEqual({
          errorClass: "undefined",
          errorCategory: "UNKNOWN"
        });
      }
    );

    it(
      "never includes an exception message in any classification result",
      () => {
        const errors: unknown[] = [
          APIError.generate(
            429,
            { error: { message: "SECRET business content" } },
            "SECRET business content",
            new Headers()
          ),
          new Error("SECRET business content"),
          new ToolCallError(
            "SECRET business content",
            new Error("SECRET business content")
          )
        ];

        for (const error of errors) {
          const classification =
            classifyExecutiveTurnFailure(error);

          expect(
            Object.keys(classification)
          ).not.toContain("errorMessage");

          expect(
            JSON.stringify(classification)
          ).not.toContain("SECRET business content");
        }
      }
    );
  }
);
