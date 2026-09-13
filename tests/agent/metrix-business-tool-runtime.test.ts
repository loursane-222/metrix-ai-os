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
  executeMetrixBusinessTool,
  METRIX_RESPONSES_FUNCTION_TOOLS,
  type MetrixTrustedToolContext
} from "../../src/lib/agent/tools/metrix-business-tool-runtime";

const suffix =
  `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

const organizationId =
  `business-runtime-org-${suffix}`;

const actorUserId =
  `business-runtime-user-${suffix}`;

const context: MetrixTrustedToolContext = {
  actorUserId,
  organizationId,
  idempotencyScope:
    `business-runtime-call-${suffix}`,
  timezone: "Europe/Istanbul",
  referenceTimeIso:
    "2026-09-13T17:32:28.860Z"
};

describe(
  "METRIX business tool runtime",
  () => {
    it(
      "publishes the three model-owned business contracts without trusted fields",
      () => {
        expect(
          METRIX_RESPONSES_FUNCTION_TOOLS.map(
            (tool) => tool.name
          )
        ).toEqual([
          "task_create",
          "customer_create",
          "customer_lookup"
        ]);

        expect(
          JSON.stringify(
            METRIX_RESPONSES_FUNCTION_TOOLS
          )
        ).not.toMatch(
          /actorUserId|organizationId|idempotencyKey|referenceTimeIso/
        );
      }
    );

    it(
      "dispatches task creation through the verified action with trusted context",
      async () => {
        await db.organization.create({
          data: {
            id: organizationId,
            name: "Business Runtime Org"
          }
        });

        await db.user.create({
          data: {
            id: actorUserId,
            email: `${actorUserId}@example.test`,
            name: "Business Runtime User"
          }
        });

        await db.organizationMember.create({
          data: {
            organizationId,
            userId: actorUserId,
            role: "MEMBER"
          }
        });

        const result =
          await executeMetrixBusinessTool({
            name: "task_create",
            argumentsJson: JSON.stringify({
              title: "Tahsilatı kontrol et",
              priority: "HIGH"
            }),
            context
          });

        expect(result).toMatchObject({
          action: "task.create",
          status: "VERIFIED",
          verified: true,
          replayed: false
        });

        const execution =
          await db.actionExecution.findUnique({
            where: {
              organizationId_actionType_idempotencyKey: {
                organizationId,
                actionType: "task.create",
                idempotencyKey:
                  `${context.idempotencyScope}:task.create`
              }
            }
          });

        expect(execution?.status).toBe("VERIFIED");
      }
    );
  }
);

afterAll(async () => {
  await db.actionExecution.deleteMany({
    where: {
      organizationId
    }
  });

  await db.task.deleteMany({
    where: {
      organizationId
    }
  });

  await db.organizationMember.deleteMany({
    where: {
      organizationId
    }
  });

  await db.organization.deleteMany({
    where: {
      id: organizationId
    }
  });

  await db.user.deleteMany({
    where: {
      id: actorUserId
    }
  });

  await db.$disconnect();
});
