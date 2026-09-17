import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  db
} from "../../src/lib/db";

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

const suffix =
  `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

const orgA = `route-org-a-${suffix}`;
const orgB = `route-org-b-${suffix}`;
const userA = `route-user-a-${suffix}`;
const userB = `route-user-b-${suffix}`;

const trustedAuthA = {
  actorUserId: userA,
  organizationId: orgA,
  timezone: "Europe/Istanbul",
  referenceTimeIso:
    "2026-09-13T17:30:00.000Z"
};

const trustedAuthB = {
  actorUserId: userB,
  organizationId: orgA,
  timezone: "Europe/Istanbul",
  referenceTimeIso:
    "2026-09-13T17:30:00.000Z"
};

const trustedAuthAOrgB = {
  actorUserId: userA,
  organizationId: orgB,
  timezone: "Europe/Istanbul",
  referenceTimeIso:
    "2026-09-13T17:30:00.000Z"
};

function requestWithBody(
  body: unknown
): Request {
  return new Request(
    "http://localhost/api/metrix",
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json"
      },
      body: JSON.stringify(body)
    }
  );
}

describe(
  "/api/metrix authenticated trust boundary",
  () => {
    beforeAll(async () => {
      await db.organization.createMany({
        data: [
          { id: orgA, name: "Route Org A" },
          { id: orgB, name: "Route Org B" }
        ]
      });

      await db.user.createMany({
        data: [
          {
            id: userA,
            email: `${userA}@example.test`,
            name: "Route User A"
          },
          {
            id: userB,
            email: `${userB}@example.test`,
            name: "Route User B"
          }
        ]
      });

      await db.organizationMember.createMany({
        data: [
          {
            organizationId: orgA,
            userId: userA,
            role: "MEMBER"
          },
          {
            organizationId: orgA,
            userId: userB,
            role: "MEMBER"
          },
          {
            organizationId: orgB,
            userId: userA,
            role: "MEMBER"
          }
        ]
      });
    });

    beforeEach(() => {
      mocks.runMetrixExecutiveTurn
        .mockReset()
        .mockResolvedValue({
          finalOutput:
            "Tamam.",
          executionItems:
            [],
          capabilityResults: [
            {
              capability: "customer_lookup",
              operation: "read",
              data: {
                customers: [
                  { id: "customer-1", name: "Atlas İnşaat" }
                ]
              }
            }
          ],
          openAiConversationId:
            `conv_mock_${suffix}`
        });

      mocks.resolveAuthenticatedExecutiveContext
        .mockReset()
        .mockResolvedValue(trustedAuthA);
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
            requestWithBody({
              message:
                "Merhaba",
              turnId:
                "turn-injection",
              actorUserId:
                "attacker-user",
              organizationId:
                "attacker-org"
            })
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
            requestWithBody({
              message:
                "Merhaba",
              turnId:
                "turn-no-session"
            })
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
      "passes only server-resolved identity to the Executive Agent, and creates a new opaque conversation binding",
      async () => {
        const {
          POST
        } =
          await import(
            "../../src/app/api/metrix/route"
          );

        const response =
          await POST(
            requestWithBody({
              message:
                "Belgin müşterisine bak.",
              turnId:
                "turn-trusted"
            })
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
            userA,
          organizationId:
            orgA,
          timezone:
            "Europe/Istanbul",
          referenceTimeIso:
            "2026-09-13T17:30:00.000Z",
          turnId:
            "turn-trusted",
          message:
            "Belgin müşterisine bak.",
          openAiConversationId:
            undefined
        });

        const body =
          await response.json();

        expect(
          typeof body.conversationId
        ).toBe("string");

        expect(body.workspace).toBeUndefined();
        expect(body.turnResult).toMatchObject({
          executiveText: "Tamam.",
          capabilityResults: [
            { capability: "customer_lookup", operation: "read" }
          ],
          presentations: [
            { type: "LIST", title: "Müşteriler" }
          ]
        });

        const persisted =
          await db.executiveConversation.findUnique(
            {
              where: {
                id: body.conversationId
              }
            }
          );

        expect(
          persisted?.userId
        ).toBe(userA);

        expect(
          persisted?.organizationId
        ).toBe(orgA);

        expect(
          persisted?.openAiConversationId
        ).toBe(`conv_mock_${suffix}`);
      }
    );

    it(
      "continues an existing conversation: loads the binding, forwards its native conversation id, and returns the same opaque handle",
      async () => {
        const binding =
          await db.executiveConversation.create(
            {
              data: {
                userId: userA,
                organizationId: orgA,
                openAiConversationId:
                  `conv_existing_${suffix}`
              }
            }
          );

        const beforeUpdatedAt =
          binding.updatedAt;

        const {
          POST
        } =
          await import(
            "../../src/app/api/metrix/route"
          );

        const response =
          await POST(
            requestWithBody({
              message:
                "Bu teklifte miktarı 3 yap.",
              turnId:
                "turn-continuation",
              conversationId:
                binding.id
            })
          );

        expect(
          response.status
        ).toBe(200);

        expect(
          mocks.runMetrixExecutiveTurn
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            openAiConversationId:
              `conv_existing_${suffix}`,
            turnId:
              "turn-continuation"
          })
        );

        const body =
          await response.json();

        expect(
          body.conversationId
        ).toBe(binding.id);

        const persisted =
          await db.executiveConversation.findUniqueOrThrow(
            {
              where: { id: binding.id }
            }
          );

        expect(
          persisted.updatedAt.getTime()
        ).toBeGreaterThanOrEqual(
          beforeUpdatedAt.getTime()
        );
      }
    );

    it(
      "rejects a conversation handle belonging to a different user with a stable, non-leaking response",
      async () => {
        const binding =
          await db.executiveConversation.create(
            {
              data: {
                userId: userA,
                organizationId: orgA,
                openAiConversationId:
                  `conv_user_isolation_${suffix}`
              }
            }
          );

        mocks.resolveAuthenticatedExecutiveContext
          .mockResolvedValue(trustedAuthB);

        const {
          POST
        } =
          await import(
            "../../src/app/api/metrix/route"
          );

        const response =
          await POST(
            requestWithBody({
              message:
                "Bu teklifte miktarı 3 yap.",
              turnId:
                "turn-foreign-user",
              conversationId:
                binding.id
            })
          );

        expect(
          response.status
        ).toBe(404);

        const body =
          await response.json();

        expect(body).toEqual({
          ok: false,
          code: "CONVERSATION_NOT_FOUND"
        });

        expect(
          JSON.stringify(body)
        ).not.toMatch(
          /conv_user_isolation|openAiConversationId/
        );

        expect(
          mocks.runMetrixExecutiveTurn
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "rejects a conversation handle belonging to a different organization with a stable, non-leaking response",
      async () => {
        const binding =
          await db.executiveConversation.create(
            {
              data: {
                userId: userA,
                organizationId: orgA,
                openAiConversationId:
                  `conv_org_isolation_${suffix}`
              }
            }
          );

        mocks.resolveAuthenticatedExecutiveContext
          .mockResolvedValue(
            trustedAuthAOrgB
          );

        const {
          POST
        } =
          await import(
            "../../src/app/api/metrix/route"
          );

        const response =
          await POST(
            requestWithBody({
              message:
                "Bu teklifte miktarı 3 yap.",
              turnId:
                "turn-foreign-org",
              conversationId:
                binding.id
            })
          );

        expect(
          response.status
        ).toBe(404);

        expect(
          await response.json()
        ).toEqual({
          ok: false,
          code: "CONVERSATION_NOT_FOUND"
        });

        expect(
          mocks.runMetrixExecutiveTurn
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "returns a stable safe response for an unknown conversation handle, with no internal leak",
      async () => {
        const {
          POST
        } =
          await import(
            "../../src/app/api/metrix/route"
          );

        const response =
          await POST(
            requestWithBody({
              message:
                "Bu teklifte miktarı 3 yap.",
              turnId:
                "turn-unknown-handle",
              conversationId:
                `does-not-exist-${suffix}`
            })
          );

        expect(
          response.status
        ).toBe(404);

        expect(
          await response.json()
        ).toEqual({
          ok: false,
          code: "CONVERSATION_NOT_FOUND"
        });

        expect(
          mocks.runMetrixExecutiveTurn
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "keeps turnId-derived idempotency scoping independent of conversationId",
      async () => {
        const binding =
          await db.executiveConversation.create(
            {
              data: {
                userId: userA,
                organizationId: orgA,
                openAiConversationId:
                  `conv_turn_scope_${suffix}`
              }
            }
          );

        const {
          POST
        } =
          await import(
            "../../src/app/api/metrix/route"
          );

        await POST(
          requestWithBody({
            message: "Merhaba",
            turnId: "turn-scope-fixed",
            conversationId: binding.id
          })
        );

        expect(
          mocks.runMetrixExecutiveTurn
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            turnId: "turn-scope-fixed"
          })
        );

        const callArg =
          mocks.runMetrixExecutiveTurn.mock
            .calls[0]?.[0];

        expect(
          Object.prototype.hasOwnProperty.call(
            callArg,
            "idempotencyScope"
          )
        ).toBe(false);
      }
    );
  }
);

afterAll(async () => {
  await db.executiveConversation.deleteMany({
    where: {
      organizationId: { in: [orgA, orgB] }
    }
  });

  await db.organizationMember.deleteMany({
    where: {
      organizationId: { in: [orgA, orgB] }
    }
  });

  await db.organization.deleteMany({
    where: { id: { in: [orgA, orgB] } }
  });

  await db.user.deleteMany({
    where: { id: { in: [userA, userB] } }
  });

  await db.$disconnect();
});
