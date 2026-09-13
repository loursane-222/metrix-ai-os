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
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } =
    await import("../../src/lib/db");

  await db.$disconnect();
});
