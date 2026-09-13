import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

const mocks =
  vi.hoisted(() => ({
    runMetrixExecutiveTurn:
      vi.fn(),

    resolveAuthenticatedExecutiveContext:
      vi.fn()
  }));

vi.mock(
  "../../src/lib/agent/metrix-executive-agent",
  () => ({
    runMetrixExecutiveTurn:
      mocks.runMetrixExecutiveTurn
  })
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

describe(
  "/api/metrix authenticated trust boundary",
  () => {
    beforeEach(() => {
      mocks.runMetrixExecutiveTurn
        .mockReset()
        .mockResolvedValue({
          finalOutput:
            "Tamam.",
          executionItems:
            []
        });

      mocks.resolveAuthenticatedExecutiveContext
        .mockReset()
        .mockResolvedValue({
          actorUserId:
            "trusted-user",
          organizationId:
            "trusted-org",
          timezone:
            "Europe/Istanbul",
          referenceTimeIso:
            "2026-09-13T17:30:00.000Z"
        });
    });

    it(
      "rejects invalid JSON",
      async () => {
        const {
          POST
        } =
          await import(
            "../../src/app/api/metrix/route"
          );

        const response =
          await POST(
            new Request(
              "http://localhost/api/metrix",
              {
                method:
                  "POST",
                headers: {
                  "content-type":
                    "application/json"
                },
                body:
                  "{"
              }
            )
          );

        expect(
          response.status
        ).toBe(400);

        expect(
          await response.json()
        ).toMatchObject({
          ok:
            false,
          code:
            "INVALID_JSON"
        });
      }
    );

    it(
      "rejects actorUserId and organizationId supplied by the client",
      async () => {
        const {
          POST
        } =
          await import(
            "../../src/app/api/metrix/route"
          );

        const response =
          await POST(
            new Request(
              "http://localhost/api/metrix",
              {
                method:
                  "POST",
                headers: {
                  "content-type":
                    "application/json"
                },
                body:
                  JSON.stringify({
                    message:
                      "Merhaba",
                    turnId:
                      "turn-injection",
                    actorUserId:
                      "attacker-user",
                    organizationId:
                      "attacker-org"
                  })
              }
            )
          );

        expect(
          response.status
        ).toBe(400);

        expect(
          mocks.runMetrixExecutiveTurn
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "returns 401 when the server cannot authenticate the session",
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
            "../../src/app/api/metrix/route"
          );

        const response =
          await POST(
            new Request(
              "http://localhost/api/metrix",
              {
                method:
                  "POST",
                headers: {
                  "content-type":
                    "application/json"
                },
                body:
                  JSON.stringify({
                    message:
                      "Merhaba",
                    turnId:
                      "turn-no-session"
                  })
              }
            )
          );

        expect(
          response.status
        ).toBe(401);

        expect(
          await response.json()
        ).toMatchObject({
          ok:
            false,
          code:
            "UNAUTHENTICATED"
        });

        expect(
          mocks.runMetrixExecutiveTurn
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "passes only server-resolved identity to the Executive Agent",
      async () => {
        const {
          POST
        } =
          await import(
            "../../src/app/api/metrix/route"
          );

        const response =
          await POST(
            new Request(
              "http://localhost/api/metrix",
              {
                method:
                  "POST",
                headers: {
                  "content-type":
                    "application/json"
                },
                body:
                  JSON.stringify({
                    message:
                      "Belgin müşterisine bak.",
                    turnId:
                      "turn-trusted"
                  })
              }
            )
          );

        expect(
          response.status
        ).toBe(200);

        expect(
          mocks.resolveAuthenticatedExecutiveContext
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          mocks.runMetrixExecutiveTurn
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          mocks.runMetrixExecutiveTurn
        ).toHaveBeenCalledWith({
          actorUserId:
            "trusted-user",
          organizationId:
            "trusted-org",
          timezone:
            "Europe/Istanbul",
          referenceTimeIso:
            "2026-09-13T17:30:00.000Z",
          turnId:
            "turn-trusted",
          message:
            "Belgin müşterisine bak."
        });
      }
    );
  }
);
