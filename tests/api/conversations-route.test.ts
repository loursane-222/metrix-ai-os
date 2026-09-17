import { afterAll, describe, expect, it } from "vitest";

import { db } from "../../src/lib/db";
import { GET as conversationsRoute } from "../../src/app/api/conversations/route";
import { issueSession } from "../../src/lib/auth/session-issuance";
import { METRIX_SESSION_COOKIE } from "../../src/lib/auth/executive-session-context";

describe("/api/conversations", () => {
  it(
    "returns only the authenticated user's own conversations, newest first",
    async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const organizationId = `conv-org-${suffix}`;
      const userId = `conv-user-${suffix}`;

      await db.organization.create({
        data: { id: organizationId, name: "Conversations Tenant" }
      });
      await db.user.create({
        data: {
          id: userId,
          email: `${userId}@example.test`,
          name: "Conversations User"
        }
      });
      await db.organizationMember.create({
        data: { organizationId, userId, role: "MEMBER" }
      });

      try {
        await db.executiveConversation.create({
          data: {
            organizationId,
            userId,
            openAiConversationId: `oai-${suffix}-1`
          }
        });
        await db.executiveConversation.create({
          data: {
            organizationId,
            userId,
            openAiConversationId: `oai-${suffix}-2`
          }
        });

        const session = await issueSession({
          userId,
          rememberMe: true
        });

        const response = await conversationsRoute(
          new Request("http://localhost/test", {
            headers: {
              Cookie: `${METRIX_SESSION_COOKIE}=${session.token}`
            }
          })
        );

        const payload = (await response.json()) as {
          ok: boolean;
          conversations: Array<{ id: string }>;
        };

        expect(response.status).toBe(200);
        expect(payload.ok).toBe(true);
        expect(payload.conversations).toHaveLength(2);
      } finally {
        await db.executiveConversation.deleteMany({
          where: { organizationId }
        });
        await db.session.deleteMany({ where: { userId } });
        await db.organizationMember.deleteMany({
          where: { organizationId }
        });
        await db.user.deleteMany({ where: { id: userId } });
        await db.organization.deleteMany({
          where: { id: organizationId }
        });
      }
    }
  );

  it("rejects an unauthenticated request", async () => {
    const response = await conversationsRoute(
      new Request("http://localhost/test")
    );

    expect(response.status).toBe(401);
  });
});

afterAll(async () => {
  await db.$disconnect();
});
