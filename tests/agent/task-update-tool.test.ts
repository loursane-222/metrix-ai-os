import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/agent/tools/task-update-tool.ts"
);

const implementationExists =
  existsSync(implementationPath);

describe("native task_update executive tool", () => {
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
      createTaskUpdateTool
    } = await import(
      "../../src/lib/agent/tools/task-update-tool"
    );

    const {
      executeTaskCreate
    } = await import(
      "../../src/lib/actions/task-create"
    );

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId =
      `tool-update-org-${suffix}`;

    const userId =
      `tool-update-user-${suffix}`;

    const turnId =
      `tool-update-turn-${suffix}`;

    await db.organization.create({
      data: {
        id: organizationId,
        name: "Native Update Tool Tenant"
      }
    });

    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        name: "Native Update Tool User"
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
      const created = await executeTaskCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `create-${suffix}`,
        title: "Ahmet teklifini hazırlama",
        priority: "MEDIUM"
      });

      const taskId = created.task.id;

      const tool = createTaskUpdateTool();

      expect(tool.name).toBe("task_update");

      const parameters =
        JSON.stringify(tool.parameters);

      expect(parameters).toContain("taskId");
      expect(parameters).toContain("status");

      expect(parameters).not.toContain(
        "actorUserId"
      );

      expect(parameters).not.toContain(
        "organizationId"
      );

      expect(parameters).not.toContain(
        "idempotencyKey"
      );

      const context = new RunContext({
        actorUserId: userId,
        organizationId,
        turnId
      });

      const args = {
        taskId,
        status: "DONE" as const
      };

      const first = await tool.invoke(
        context,
        JSON.stringify(args)
      );

      const firstResult = (
        typeof first === "string"
          ? JSON.parse(first)
          : first
      ) as {
        action: "task.update";
        status: "VERIFIED";
        verified: true;
        replayed: boolean;
        task: {
          id: string;
          organizationId: string;
          status: string;
        };
      };

      expect(firstResult).toMatchObject({
        action: "task.update",
        status: "VERIFIED",
        verified: true,
        replayed: false
      });

      expect(firstResult.task.id).toBe(taskId);
      expect(firstResult.task.status).toBe(
        "DONE"
      );

      expect(
        firstResult.task.organizationId
      ).toBe(organizationId);

      const replay = await tool.invoke(
        context,
        JSON.stringify(args)
      );

      const replayResult = (
        typeof replay === "string"
          ? JSON.parse(replay)
          : replay
      ) as {
        replayed: boolean;
        task: { id: string };
      };

      expect(replayResult.replayed).toBe(
        true
      );

      expect(replayResult.task.id).toBe(
        taskId
      );

      const executions =
        await db.actionExecution.findMany({
          where: {
            organizationId,
            actionType: "task.update"
          }
        });

      expect(executions).toHaveLength(1);
      expect(executions[0]?.status).toBe(
        "VERIFIED"
      );

      expect(
        executions[0]?.idempotencyKey
      ).toBe(
        `turn:${turnId}:task.update:${taskId}`
      );

      const persisted = await db.task.findUnique(
        {
          where: { id: taskId }
        }
      );

      expect(persisted?.status).toBe("DONE");
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
