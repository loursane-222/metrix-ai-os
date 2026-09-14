import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/actions/task-update.ts"
);

const implementationExists = existsSync(implementationPath);

describe("verified task.update action", () => {
  it("requires the typed task.update implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("authorizes, mutates once, and returns only a verified readback", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const {
      executeTaskUpdate
    } = await import("../../src/lib/actions/task-update");
    const {
      executeTaskCreate
    } = await import("../../src/lib/actions/task-create");

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `task-update-org-${suffix}`;
    const userId = `task-update-user-${suffix}`;
    const outsiderId = `task-update-outsider-${suffix}`;
    const otherOrgId = `task-update-other-org-${suffix}`;
    const otherOrgUserId = `task-update-other-org-user-${suffix}`;

    await db.organization.createMany({
      data: [
        {
          id: organizationId,
          name: "Task Update Tenant"
        },
        {
          id: otherOrgId,
          name: "Other Tenant"
        }
      ]
    });

    await db.user.createMany({
      data: [
        {
          id: userId,
          email: `${userId}@example.test`,
          name: "Authorized User"
        },
        {
          id: outsiderId,
          email: `${outsiderId}@example.test`,
          name: "Outsider User"
        },
        {
          id: otherOrgUserId,
          email: `${otherOrgUserId}@example.test`,
          name: "Other Org User"
        }
      ]
    });

    await db.organizationMember.createMany({
      data: [
        {
          organizationId,
          userId,
          role: "MEMBER"
        },
        {
          organizationId: otherOrgId,
          userId: otherOrgUserId,
          role: "MEMBER"
        }
      ]
    });

    try {
      const created = await executeTaskCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `create-${suffix}`,
        title: "Belgin teklifini hazırla",
        priority: "MEDIUM"
      });

      const taskId = created.task.id;

      const idempotencyKey = `update-${suffix}`;

      const first = await executeTaskUpdate({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        taskId,
        status: "DONE"
      });

      expect(first.action).toBe("task.update");
      expect(first.status).toBe("VERIFIED");
      expect(first.verified).toBe(true);
      expect(first.replayed).toBe(false);
      expect(first.task.id).toBe(taskId);
      expect(first.task.status).toBe("DONE");
      expect(first.task.priority).toBe("MEDIUM");

      const persisted = await db.task.findUnique({
        where: { id: taskId }
      });

      expect(persisted?.status).toBe("DONE");
      expect(persisted?.organizationId).toBe(
        organizationId
      );

      const replay = await executeTaskUpdate({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        taskId,
        status: "DONE"
      });

      expect(replay.verified).toBe(true);
      expect(replay.replayed).toBe(true);
      expect(replay.task.id).toBe(taskId);

      await expect(
        executeTaskUpdate({
          actorUserId: userId,
          organizationId,
          idempotencyKey,
          taskId,
          status: "CANCELLED"
        })
      ).rejects.toMatchObject({
        code: "IDEMPOTENCY_CONFLICT"
      });

      const stillDone = await db.task.findUnique({
        where: { id: taskId }
      });

      expect(stillDone?.status).toBe("DONE");

      const priorityKey = `update-priority-${suffix}`;

      const priorityResult = await executeTaskUpdate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: priorityKey,
        taskId,
        priority: "HIGH"
      });

      expect(priorityResult.task.priority).toBe(
        "HIGH"
      );

      expect(priorityResult.task.status).toBe(
        "DONE"
      );

      const dueKey = `update-due-${suffix}`;

      const dueResult = await executeTaskUpdate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: dueKey,
        taskId,
        dueAt: "2026-12-31T10:00:00.000Z"
      });

      expect(dueResult.task.dueAt).toBe(
        "2026-12-31T10:00:00.000Z"
      );

      await expect(
        executeTaskUpdate({
          actorUserId: outsiderId,
          organizationId,
          idempotencyKey: `unauthorized-${suffix}`,
          taskId,
          status: "OPEN"
        })
      ).rejects.toMatchObject({
        code: "ORGANIZATION_ACCESS_DENIED"
      });

      const unaffected = await db.task.findUnique({
        where: { id: taskId }
      });

      expect(unaffected?.status).toBe("DONE");

      await expect(
        executeTaskUpdate({
          actorUserId: otherOrgUserId,
          organizationId: otherOrgId,
          idempotencyKey: `cross-tenant-${suffix}`,
          taskId,
          status: "CANCELLED"
        })
      ).rejects.toMatchObject({
        code: "TASK_NOT_FOUND"
      });

      const crossTenantUnaffected =
        await db.task.findUnique({
          where: { id: taskId }
        });

      expect(crossTenantUnaffected?.status).toBe(
        "DONE"
      );

      await expect(
        executeTaskUpdate({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `nonexistent-${suffix}`,
          taskId: `does-not-exist-${suffix}`,
          status: "DONE"
        })
      ).rejects.toMatchObject({
        code: "TASK_NOT_FOUND"
      });

      const nonexistentExecution =
        await db.actionExecution.findUnique({
          where: {
            organizationId_actionType_idempotencyKey: {
              organizationId,
              actionType: "task.update",
              idempotencyKey: `nonexistent-${suffix}`
            }
          }
        });

      expect(nonexistentExecution).toBeNull();

      await expect(
        executeTaskUpdate({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `empty-${suffix}`,
          taskId
        } as never)
      ).rejects.toThrow();

      const emptyUpdateExecution =
        await db.actionExecution.findUnique({
          where: {
            organizationId_actionType_idempotencyKey: {
              organizationId,
              actionType: "task.update",
              idempotencyKey: `empty-${suffix}`
            }
          }
        });

      expect(emptyUpdateExecution).toBeNull();

      const execution = await db.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId,
            actionType: "task.update",
            idempotencyKey
          }
        }
      });

      expect(execution?.status).toBe("VERIFIED");
      expect(execution?.resourceId).toBe(taskId);
      expect(execution?.verifiedAt).not.toBeNull();
    } finally {
      await db.actionExecution.deleteMany({
        where: {
          organizationId: {
            in: [organizationId, otherOrgId]
          }
        }
      });

      await db.task.deleteMany({
        where: {
          organizationId: {
            in: [organizationId, otherOrgId]
          }
        }
      });

      await db.organizationMember.deleteMany({
        where: {
          organizationId: {
            in: [organizationId, otherOrgId]
          }
        }
      });

      await db.user.deleteMany({
        where: {
          id: {
            in: [userId, outsiderId, otherOrgUserId]
          }
        }
      });

      await db.organization.deleteMany({
        where: {
          id: {
            in: [organizationId, otherOrgId]
          }
        }
      });
    }
  });
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
