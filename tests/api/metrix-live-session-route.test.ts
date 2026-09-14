import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

const mocks =
  vi.hoisted(() => ({
    bootstrapLiveSession:
      vi.fn(),
    resolveAuthenticatedExecutiveContext:
      vi.fn()
  }));

vi.mock(
  "../../src/lib/live/live-session-service",
  async () => {
    const actual =
      await vi.importActual<
        typeof import(
          "../../src/lib/live/live-session-service"
        )
      >(
        "../../src/lib/live/live-session-service"
      );

    return {
      ...actual,
      bootstrapLiveSession:
        mocks.bootstrapLiveSession
    };
  }
);

vi.mock(
  "../../src/lib/auth/executive-session-context",
  async () => {
    const actual =
      await vi.importActual<
        typeof import(
          "../../src/lib/auth/executive-session-context"
        )
      >(
        "../../src/lib/auth/executive-session-context"
      );

    return {
      ...actual,
      resolveAuthenticatedExecutiveContext:
        mocks.resolveAuthenticatedExecutiveContext
    };
  }
);

const trustedAuth = {
  actorUserId:
    "trusted-user",
  organizationId:
    "trusted-org",
  timezone:
    "Europe/Istanbul",
  referenceTimeIso:
    "2026-09-14T07:30:00.000Z"
};

function requestWithBody(
  body: string
): Request {
  return new Request(
    "http://localhost/api/metrix/live/session",
    {
      method:
        "POST",
      headers: {
        "content-type":
          "application/json"
      },
      body
    }
  );
}

describe(
  "/api/metrix/live/session trust boundary",
  () => {
    beforeEach(() => {
      mocks.bootstrapLiveSession
        .mockReset()
        .mockResolvedValue({
          bindingId:
            "binding_test_1",
          answerSdp:
            "v=0\r\nanswer",
          voice:
            "marin"
        });

      mocks.resolveAuthenticatedExecutiveContext
        .mockReset()
        .mockResolvedValue(
          trustedAuth
        );
    });

    it(
      "rejects invalid JSON without authenticating or bootstrapping",
      async () => {
        const {
          POST
        } =
          await import(
            "../../src/app/api/metrix/live/session/route"
          );

        const response =
          await POST(
            requestWithBody("{")
          );

        expect(
          response.status
        ).toBe(400);

        expect(
          await response.json()
        ).toEqual({
          ok: false,
          code: "INVALID_JSON"
        });

        expect(
          mocks.resolveAuthenticatedExecutiveContext
        ).not.toHaveBeenCalled();

        expect(
          mocks.bootstrapLiveSession
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "rejects client-supplied identity fields",
      async () => {
        const {
          POST
        } =
          await import(
            "../../src/app/api/metrix/live/session/route"
          );

        const response =
          await POST(
            requestWithBody(
              JSON.stringify({
                sdp:
                  "v=0\r\noffer",
                actorUserId:
                  "attacker-user",
                organizationId:
                  "attacker-org"
              })
            )
          );

        expect(
          response.status
        ).toBe(400);

        expect(
          await response.json()
        ).toEqual({
          ok: false,
          code: "INVALID_REQUEST"
        });

        expect(
          mocks.resolveAuthenticatedExecutiveContext
        ).not.toHaveBeenCalled();

        expect(
          mocks.bootstrapLiveSession
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "returns the stable authentication error without bootstrapping",
      async () => {
        const {
          ExecutiveAuthenticationError
        } =
          await import(
            "../../src/lib/auth/executive-session-context"
          );

        mocks.resolveAuthenticatedExecutiveContext
          .mockRejectedValueOnce(
            new ExecutiveAuthenticationError(
              "UNAUTHENTICATED",
              401
            )
          );

        const {
          POST
        } =
          await import(
            "../../src/app/api/metrix/live/session/route"
          );

        const response =
          await POST(
            requestWithBody(
              JSON.stringify({
                sdp:
                  "v=0\r\noffer"
              })
            )
          );

        expect(
          response.status
        ).toBe(401);

        expect(
          await response.json()
        ).toEqual({
          ok: false,
          code: "UNAUTHENTICATED"
        });

        expect(
          mocks.bootstrapLiveSession
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "returns INVALID_SDP for a malformed SDP without exposing internals",
      async () => {
        const {
          InvalidLiveSdpError
        } =
          await import(
            "../../src/lib/live/live-session-service"
          );

        mocks.bootstrapLiveSession
          .mockRejectedValueOnce(
            new InvalidLiveSdpError()
          );

        const {
          POST
        } =
          await import(
            "../../src/app/api/metrix/live/session/route"
          );

        const response =
          await POST(
            requestWithBody(
              JSON.stringify({
                sdp:
                  "   "
              })
            )
          );

        expect(
          response.status
        ).toBe(400);

        expect(
          await response.json()
        ).toEqual({
          ok: false,
          code: "INVALID_SDP"
        });
      }
    );

    it(
      "returns a stable public bootstrap failure without leaking upstream details",
      async () => {
        const {
          LiveSessionBootstrapError
        } =
          await import(
            "../../src/lib/live/live-session-service"
          );

        mocks.bootstrapLiveSession
          .mockRejectedValueOnce(
            new LiveSessionBootstrapError()
          );

        const {
          POST
        } =
          await import(
            "../../src/app/api/metrix/live/session/route"
          );

        const response =
          await POST(
            requestWithBody(
              JSON.stringify({
                sdp:
                  "v=0\\r\\noffer"
              })
            )
          );

        expect(
          response.status
        ).toBe(502);

        const body =
          await response.json();

        expect(
          body
        ).toEqual({
          ok: false,
          code:
            "LIVE_SESSION_CREATE_FAILED"
        });

        expect(
          JSON.stringify(
            body
          )
        ).not.toMatch(
          /OPENAI_API_KEY|actorUserId|organizationId|openAiSessionId|simulated upstream/
        );
      }
    );

    it(
      "passes only the SDP and server-resolved trusted auth to bootstrap",
      async () => {
        const {
          POST
        } =
          await import(
            "../../src/app/api/metrix/live/session/route"
          );

        const response =
          await POST(
            requestWithBody(
              JSON.stringify({
                sdp:
                  "v=0\r\noffer"
              })
            )
          );

        expect(
          mocks.resolveAuthenticatedExecutiveContext
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          mocks.bootstrapLiveSession
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          mocks.bootstrapLiveSession
        ).toHaveBeenCalledWith({
          sdp:
            "v=0\r\noffer",
          auth:
            trustedAuth
        });

        expect(
          response.status
        ).toBe(201);
      }
    );

    it(
      "returns only the browser-safe bootstrap contract and disables caching",
      async () => {
        const {
          POST
        } =
          await import(
            "../../src/app/api/metrix/live/session/route"
          );

        const response =
          await POST(
            requestWithBody(
              JSON.stringify({
                sdp:
                  "v=0\r\noffer"
              })
            )
          );

        expect(
          response.status
        ).toBe(201);

        expect(
          response.headers.get(
            "cache-control"
          )
        ).toBe("no-store");

        const body =
          await response.json();

        expect(body).toEqual({
          bindingId:
            "binding_test_1",
          answerSdp:
            "v=0\r\nanswer",
          voice:
            "marin"
        });

        expect(
          JSON.stringify(body)
        ).not.toMatch(
          /OPENAI_API_KEY|actorUserId|organizationId|openAiSessionId/
        );
      }
    );
  }
);
