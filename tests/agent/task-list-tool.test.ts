import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/agent/tools/task-list-tool.ts"
);

const implementationExists =
  existsSync(implementationPath);

describe("native task_list executive tool", () => {
  it("requires the native tool implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("keeps identity in trusted server context and returns grounded task reality", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { RunContext } =
      await import("@openai/agents");

    const { db } =
      await import("../../src/lib/db");

    const {
      createTaskListTool
    } = await import(
      "../../src/lib/agent/tools/task-list-tool"
    );

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId =
      `tool-list-org-${suffix}`;

    const userId =
      `tool-list-user-${suffix}`;

    const turnId =
      `tool-list-turn-${suffix}`;

    await db.organization.create({
      data: {
        id: organizationId,
        name: "Native List Tool Tenant"
      }
    });

    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        name: "Native List Tool User"
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
      const tool = createTaskListTool();

      expect(tool.name).toBe("task_list");

      const parameters =
        JSON.stringify(tool.parameters);

      expect(parameters).toContain("status");
      expect(parameters).toContain("priority");
      expect(parameters).toContain("titleContains");
      expect(parameters).toContain("createdByMe");
      expect(parameters).toContain("assignedToMe");

      expect(parameters).not.toContain(
        "actorUserId"
      );

      expect(parameters).not.toContain(
        "organizationId"
      );

      expect(parameters).not.toContain(
        "turnId"
      );

      expect(parameters).not.toContain(
        "assignedToUserId"
      );

      expect(parameters).not.toContain(
        "createdByUserId"
      );

      await db.task.create({
        data: {
          organizationId,
          title: "Ahmet teklifini hazırlama",
          status: "OPEN",
          priority: "HIGH",
          createdByUserId: userId
        }
      });

      const context = new RunContext({
        actorUserId: userId,
        organizationId,
        turnId
      });

      const raw = await tool.invoke(
        context,
        JSON.stringify({
          titleContains: "Ahmet"
        })
      );

      const result = (
        typeof raw === "string"
          ? JSON.parse(raw)
          : raw
      ) as {
        source: string;
        count: number;
        tasks: Array<{
          id: string;
          organizationId: string;
          title: string;
        }>;
      };

      expect(result.source).toBe(
        "COMPANY_REALITY"
      );

      expect(result.count).toBe(1);

      expect(result.tasks[0]?.title).toBe(
        "Ahmet teklifini hazırlama"
      );

      expect(
        result.tasks[0]?.organizationId
      ).toBe(organizationId);

      const otherUserId =
        `tool-list-other-user-${suffix}`;

      await db.user.create({
        data: {
          id: otherUserId,
          email:
            `${otherUserId}@example.test`,
          name: "Other Assignee"
        }
      });

      const assignedTask =
        await db.task.create({
          data: {
            organizationId,
            title:
              "Bana atanmış ama başkasının oluşturduğu görev",
            status: "OPEN",
            priority: "MEDIUM",
            createdByUserId: otherUserId,
            assignedToUserId: userId
          }
        });

      await db.task.create({
        data: {
          organizationId,
          title:
            "Başkasına atanmış görev",
          status: "OPEN",
          priority: "MEDIUM",
          createdByUserId: userId,
          assignedToUserId: otherUserId
        }
      });

      const assignedRaw = await tool.invoke(
        context,
        JSON.stringify({
          assignedToMe: true
        })
      );

      const assignedResult = (
        typeof assignedRaw === "string"
          ? JSON.parse(assignedRaw)
          : assignedRaw
      ) as {
        tasks: Array<{ id: string }>;
      };

      expect(
        assignedResult.tasks.map(
          task => task.id
        )
      ).toEqual([assignedTask.id]);

      await db.user.delete({
        where: { id: otherUserId }
      });

      const empty = await tool.invoke(
        context,
        JSON.stringify({
          titleContains:
            "hiç eşleşmeyecek bir metin"
        })
      );

      const emptyResult = (
        typeof empty === "string"
          ? JSON.parse(empty)
          : empty
      ) as {
        source: string;
        count: number;
        tasks: unknown[];
      };

      expect(emptyResult.count).toBe(0);
      expect(emptyResult.tasks).toEqual([]);
      expect(emptyResult.source).toBe(
        "COMPANY_REALITY"
      );
    } finally {
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
