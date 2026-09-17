import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/actions/task-create.ts"
);

const implementationExists = existsSync(implementationPath);

describe("verified task.create action", () => {
  it("requires the typed task.create implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("authorizes, mutates once, and returns only a verified readback", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const {
      executeTaskCreate
    } = await import("../../src/lib/actions/task-create");

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `task-org-${suffix}`;
    const userId = `task-user-${suffix}`;
    const outsiderId = `task-outsider-${suffix}`;
    const idempotencyKey = `task-create-${suffix}`;

    await db.organization.create({
      data: {
        id: organizationId,
        name: "Task Action Tenant"
      }
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
        }
      ]
    });

    await db.organizationMember.create({
      data: {
        organizationId,
        userId,
        role: "MEMBER"
      }
    });

    try {
      const first = await executeTaskCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        title: "Belgin tahsilatını yarın kontrol et",
        priority: "HIGH"
      });

      expect(first.action).toBe("task.create");
      expect(first.status).toBe("VERIFIED");
      expect(first.verified).toBe(true);
      expect(first.replayed).toBe(false);

      expect(first.task.organizationId).toBe(
        organizationId
      );

      expect(first.task.title).toBe(
        "Belgin tahsilatını yarın kontrol et"
      );

      expect(first.task.priority).toBe("HIGH");
      expect(first.task.status).toBe("OPEN");

      // No explicit-assignee input exists yet — a task created without
      // one must default to its creating actor, not stay unassigned.
      expect(first.task.assignedToUserId).toBe(userId);

      const persisted = await db.task.findUnique({
        where: {
          id: first.task.id
        }
      });

      expect(persisted).not.toBeNull();
      expect(persisted?.organizationId).toBe(
        organizationId
      );
      expect(persisted?.assignedToUserId).toBe(
        userId
      );
      expect(persisted?.createdByUserId).toBe(
        userId
      );

      const replay = await executeTaskCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        title: "Belgin tahsilatını yarın kontrol et",
        priority: "HIGH"
      });

      expect(replay.verified).toBe(true);
      expect(replay.replayed).toBe(true);
      expect(replay.task.id).toBe(first.task.id);

      const taskCount = await db.task.count({
        where: {
          organizationId,
          title: "Belgin tahsilatını yarın kontrol et"
        }
      });

      expect(taskCount).toBe(1);

      await expect(
        executeTaskCreate({
          actorUserId: userId,
          organizationId,
          idempotencyKey,
          title: "Aynı anahtarla başka görev",
          priority: "HIGH"
        })
      ).rejects.toMatchObject({
        code: "IDEMPOTENCY_CONFLICT"
      });

      await expect(
        executeTaskCreate({
          actorUserId: outsiderId,
          organizationId,
          idempotencyKey: `unauthorized-${suffix}`,
          title: "Yetkisiz görev"
        })
      ).rejects.toMatchObject({
        code: "ORGANIZATION_ACCESS_DENIED"
      });

      const unauthorizedCount = await db.task.count({
        where: {
          organizationId,
          title: "Yetkisiz görev"
        }
      });

      expect(unauthorizedCount).toBe(0);

      const execution = await db.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId,
            actionType: "task.create",
            idempotencyKey
          }
        }
      });

      expect(execution?.status).toBe("VERIFIED");
      expect(execution?.resourceId).toBe(first.task.id);
      expect(execution?.verifiedAt).not.toBeNull();
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

      await db.user.deleteMany({
        where: {
          id: {
            in: [userId, outsiderId]
          }
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

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
