import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/agent/tools/task-create-tool.ts"
);

const implementationExists =
  existsSync(implementationPath);

describe("native task.create executive tool", () => {
  it("requires the native tool implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("keeps identity and idempotency in trusted server context", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { RunContext } =
      await import("@openai/agents");

    const { db } =
      await import("../../src/lib/db");

    const {
      createTaskCreateTool
    } = await import(
      "../../src/lib/agent/tools/task-create-tool"
    );

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId =
      `tool-org-${suffix}`;

    const userId =
      `tool-user-${suffix}`;

    const turnId =
      `tool-turn-${suffix}`;

    await db.organization.create({
      data: {
        id: organizationId,
        name: "Native Tool Tenant"
      }
    });

    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        name: "Native Tool User"
      }
    });

    await db.organizationMember.create({
      data: {
        organizationId,
        userId,
        role: "MEMBER"
      }
    });

    try {
      const tool = createTaskCreateTool();

      expect(tool.name).toBe("task_create");

      const parameters =
        JSON.stringify(tool.parameters);

      expect(parameters).toContain("title");
      expect(parameters).toContain("priority");
      expect(parameters).toContain("dueAt");

      expect(parameters).not.toContain(
        "actorUserId"
      );

      expect(parameters).not.toContain(
        "organizationId"
      );

      expect(parameters).not.toContain(
        "idempotencyKey"
      );

      expect(parameters).not.toContain(
        "turnId"
      );

      const context = new RunContext({
        actorUserId: userId,
        organizationId,
        turnId
      });

      const args = {
        title: "Belgin tahsilatını yarın kontrol et",
        priority: "HIGH" as const
      };

      const first = await tool.invoke(
        context,
        JSON.stringify(args)
      );

      expect(first).toMatchObject({
        action: "task.create",
        status: "VERIFIED",
        verified: true,
        replayed: false
      });

      const firstResult = (
        typeof first === "string"
          ? JSON.parse(first)
          : first
      ) as unknown as {
        action: "task.create";
        status: "VERIFIED";
        verified: true;
        replayed: boolean;
        task: {
          id: string;
          organizationId: string;
        };
      };

      expect(firstResult).toMatchObject({
        action: "task.create",
        status: "VERIFIED",
        verified: true,
        replayed: false
      });

      expect(
        firstResult.task.organizationId
      ).toBe(organizationId);

      const replay = await tool.invoke(
        context,
        JSON.stringify(args)
      );

      expect(replay).toMatchObject({
        action: "task.create",
        status: "VERIFIED",
        verified: true,
        replayed: true
      });

      const replayResult = (
        typeof replay === "string"
          ? JSON.parse(replay)
          : replay
      ) as unknown as {
        action: "task.create";
        status: "VERIFIED";
        verified: true;
        replayed: boolean;
        task: {
          id: string;
        };
      };

      expect(replayResult).toMatchObject({
        action: "task.create",
        status: "VERIFIED",
        verified: true,
        replayed: true
      });

      expect(replayResult.task.id).toBe(
        firstResult.task.id
      );

      const taskCount =
        await db.task.count({
          where: {
            organizationId,
            title:
              "Belgin tahsilatını yarın kontrol et"
          }
        });

      expect(taskCount).toBe(1);

      const executions =
        await db.actionExecution.findMany({
          where: {
            organizationId,
            actionType: "task.create"
          }
        });

      expect(executions).toHaveLength(1);
      expect(executions[0]?.status).toBe(
        "VERIFIED"
      );

      expect(
        executions[0]?.idempotencyKey
      ).toBe(`turn:${turnId}:task.create`);
    } finally {
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

      await db.user.delete({
        where: {
          id: userId
        }
      });

      await db.organization.delete({
        where: {
          id: organizationId
        }
      });
    }
  });
  it(
    "accepts a valid ISO 8601 datetime with timezone offset",
    async () => {
      expect(
        implementationExists
      ).toBe(true);

      if (!implementationExists) return;

      const {
        RunContext
      } =
        await import(
          "@openai/agents"
        );

      const {
        db
      } =
        await import(
          "../../src/lib/db"
        );

      const {
        createTaskCreateTool
      } =
        await import(
          "../../src/lib/agent/tools/task-create-tool"
        );

      const suffix =
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;

      const organizationId =
        `offset-org-${suffix}`;

      const userId =
        `offset-user-${suffix}`;

      const turnId =
        `offset-turn-${suffix}`;

      await db.organization.create({
        data: {
          id:
            organizationId,
          name:
            "Offset Datetime Tenant"
        }
      });

      await db.user.create({
        data: {
          id:
            userId,
          email:
            `${userId}@example.test`,
          name:
            "Offset Datetime User"
        }
      });

      await db.organizationMember.create({
        data: {
          organizationId,
          userId,
          role:
            "MEMBER"
        }
      });

      try {
        const tool =
          createTaskCreateTool();

        const context =
          new RunContext({
            actorUserId:
              userId,
            organizationId,
            turnId,
            timezone:
              "Europe/Istanbul",
            referenceTimeIso:
              "2026-09-13T17:32:28.860Z"
          });

        const result =
          await tool.invoke(
            context,
            JSON.stringify({
              title:
                "Belgin tahsilatını kontrol et",
              priority:
                "HIGH",
              dueAt:
                "2026-09-14T15:30:00+03:00"
            })
          );

        if (
          typeof result ===
            "string" &&
          result.startsWith(
            "An error occurred"
          )
        ) {
          throw new Error(
            `RAW_TOOL_RESULT: ${result}`
          );
        }

        const parsed =
          (
            typeof result ===
            "string"
              ? JSON.parse(
                  result
                )
              : result
          ) as {
            action:
              "task.create";
            status:
              "VERIFIED";
            verified:
              boolean;
            task: {
              organizationId:
                string;
              dueAt:
                string | null;
            };
          };

        expect(
          parsed
        ).toMatchObject({
          action:
            "task.create",
          status:
            "VERIFIED",
          verified:
            true
        });

        expect(
          parsed.task.organizationId
        ).toBe(
          organizationId
        );

        expect(
          parsed.task.dueAt
        ).toBe(
          "2026-09-14T12:30:00.000Z"
        );

        const task =
          await db.task.findFirst({
            where: {
              organizationId,
              title:
                "Belgin tahsilatını kontrol et"
            }
          });

        expect(
          task?.dueAt?.toISOString()
        ).toBe(
          "2026-09-14T12:30:00.000Z"
        );

        const execution =
          await db.actionExecution.findUnique({
            where: {
              organizationId_actionType_idempotencyKey: {
                organizationId,
                actionType:
                  "task.create",
                idempotencyKey:
                  `turn:${turnId}:task.create`
              }
            }
          });

        expect(
          execution?.status
        ).toBe(
          "VERIFIED"
        );
      } finally {
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

        await db.user.delete({
          where: {
            id:
              userId
          }
        });

        await db.organization.delete({
          where: {
            id:
              organizationId
          }
        });
      }
    }
  );

});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } =
    await import("../../src/lib/db");

  await db.$disconnect();
});
