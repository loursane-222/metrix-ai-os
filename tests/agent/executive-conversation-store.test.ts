import {
  afterAll,
  describe,
  expect,
  it
} from "vitest";

import {
  db
} from "../../src/lib/db";

import {
  ExecutiveConversationNotFoundError,
  createExecutiveConversationBinding,
  loadExecutiveConversationBinding,
  touchExecutiveConversationBinding
} from "../../src/lib/agent/executive-conversation-store";

const suffix =
  `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

const orgA = `ecs-org-a-${suffix}`;
const orgB = `ecs-org-b-${suffix}`;
const userA = `ecs-user-a-${suffix}`;
const userB = `ecs-user-b-${suffix}`;

describe(
  "executive conversation ownership store",
  () => {
    it(
      "creates a binding, loads it back only for its own user+org, and never for a foreign user, org, or unknown id",
      async () => {
        await db.organization.createMany({
          data: [
            { id: orgA, name: "ECS Org A" },
            { id: orgB, name: "ECS Org B" }
          ]
        });

        await db.user.createMany({
          data: [
            {
              id: userA,
              email: `${userA}@example.test`,
              name: "ECS User A"
            },
            {
              id: userB,
              email: `${userB}@example.test`,
              name: "ECS User B"
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
              organizationId: orgB,
              userId: userB,
              role: "MEMBER"
            }
          ]
        });

        try {
          const created =
            await createExecutiveConversationBinding(
              {
                actorUserId: userA,
                organizationId: orgA,
                openAiConversationId:
                  `conv_store_${suffix}`
              }
            );

          expect(created.userId).toBe(userA);
          expect(
            created.organizationId
          ).toBe(orgA);
          expect(
            created.openAiConversationId
          ).toBe(`conv_store_${suffix}`);

          const loaded =
            await loadExecutiveConversationBinding(
              {
                conversationId: created.id,
                actorUserId: userA,
                organizationId: orgA
              }
            );

          expect(loaded).toEqual(created);

          await expect(
            loadExecutiveConversationBinding({
              conversationId: created.id,
              actorUserId: userB,
              organizationId: orgA
            })
          ).rejects.toBeInstanceOf(
            ExecutiveConversationNotFoundError
          );

          await expect(
            loadExecutiveConversationBinding({
              conversationId: created.id,
              actorUserId: userA,
              organizationId: orgB
            })
          ).rejects.toBeInstanceOf(
            ExecutiveConversationNotFoundError
          );

          await expect(
            loadExecutiveConversationBinding({
              conversationId: `unknown-${suffix}`,
              actorUserId: userA,
              organizationId: orgA
            })
          ).rejects.toBeInstanceOf(
            ExecutiveConversationNotFoundError
          );

          const before =
            await db.executiveConversation.findUniqueOrThrow(
              { where: { id: created.id } }
            );

          await new Promise(resolve =>
            setTimeout(resolve, 5)
          );

          await touchExecutiveConversationBinding(
            { conversationId: created.id }
          );

          const after =
            await db.executiveConversation.findUniqueOrThrow(
              { where: { id: created.id } }
            );

          expect(
            after.updatedAt.getTime()
          ).toBeGreaterThan(
            before.updatedAt.getTime()
          );
        } finally {
          await db.executiveConversation.deleteMany(
            {
              where: {
                organizationId: {
                  in: [orgA, orgB]
                }
              }
            }
          );

          await db.organizationMember.deleteMany(
            {
              where: {
                organizationId: {
                  in: [orgA, orgB]
                }
              }
            }
          );

          await db.organization.deleteMany({
            where: {
              id: { in: [orgA, orgB] }
            }
          });

          await db.user.deleteMany({
            where: {
              id: { in: [userA, userB] }
            }
          });
        }
      }
    );
  }
);

afterAll(async () => {
  await db.$disconnect();
});
