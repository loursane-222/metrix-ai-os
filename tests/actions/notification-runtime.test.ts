import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const createImplementationPath = join(process.cwd(), "src/lib/actions/notification-create.ts");
const markReadImplementationPath = join(process.cwd(), "src/lib/actions/notification-mark-read.ts");
const listImplementationPath = join(process.cwd(), "src/lib/actions/notification-list.ts");

const implementationExists =
  existsSync(createImplementationPath) &&
  existsSync(markReadImplementationPath) &&
  existsSync(listImplementationPath);

describe("generic notification runtime (create / mark-read / list)", () => {
  it("requires the typed notification-create/mark-read/list implementations", () => {
    expect(implementationExists).toBe(true);
  });

  it("creates, lists, and marks a real tenant/user-scoped notification read, idempotently and safely", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const { executeNotificationCreate } = await import("../../src/lib/actions/notification-create");
    const { executeNotificationMarkRead } = await import("../../src/lib/actions/notification-mark-read");
    const { listNotificationsForUser } = await import("../../src/lib/actions/notification-list");

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `notif-org-${suffix}`;
    const otherOrgId = `notif-other-org-${suffix}`;
    const userId = `notif-user-${suffix}`;
    const teammateId = `notif-teammate-${suffix}`;
    const otherOrgUserId = `notif-other-org-user-${suffix}`;

    await db.organization.createMany({
      data: [
        { id: organizationId, name: "Notification Tenant" },
        { id: otherOrgId, name: "Other Tenant" }
      ]
    });

    await db.user.createMany({
      data: [
        { id: userId, email: `${userId}@example.test`, name: "Notif User" },
        { id: teammateId, email: `${teammateId}@example.test`, name: "Teammate" },
        { id: otherOrgUserId, email: `${otherOrgUserId}@example.test`, name: "Other Org User" }
      ]
    });

    await db.organizationMember.createMany({
      data: [
        { organizationId, userId, role: "MEMBER" },
        { organizationId, userId: teammateId, role: "MEMBER" },
        { organizationId: otherOrgId, userId: otherOrgUserId, role: "MEMBER" }
      ]
    });

    try {
      const idempotencyKey = `notif-create-${suffix}`;

      const first = await executeNotificationCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        category: "finance",
        priority: "HIGH",
        title: "Fatura gecikti",
        body: "INV-1001 için ödeme 5 gün gecikti",
        sourceType: "Invoice",
        sourceId: "inv_1001"
      });

      expect(first.action).toBe("notification.create");
      expect(first.verified).toBe(true);
      expect(first.replayed).toBe(false);
      expect(first.notification.readAt).toBeNull();
      expect(first.notification.userId).toBe(userId);

      const notificationId = first.notification.id;

      // --- exact replay ---
      const replay = await executeNotificationCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        category: "finance",
        priority: "HIGH",
        title: "Fatura gecikti",
        body: "INV-1001 için ödeme 5 gün gecikti",
        sourceType: "Invoice",
        sourceId: "inv_1001"
      });

      expect(replay.replayed).toBe(true);
      expect(replay.notification.id).toBe(notificationId);

      const oneNotification = await db.notification.count({ where: { organizationId, userId } });
      expect(oneNotification).toBe(1);

      // --- create for a teammate (explicit userId) ---
      const forTeammate = await executeNotificationCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `notif-create-teammate-${suffix}`,
        userId: teammateId,
        category: "tasks",
        title: "Sana yeni bir görev atandı"
      });

      expect(forTeammate.notification.userId).toBe(teammateId);

      // --- create for a non-member is rejected ---
      await expect(executeNotificationCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `notif-create-outsider-${suffix}`,
        userId: otherOrgUserId,
        category: "tasks",
        title: "Yetkisiz alıcı"
      })).rejects.toMatchObject({ code: "NOTIFICATION_RECIPIENT_NOT_FOUND" });

      // --- list: user-scoped (own notifications only, not teammate's) ---
      const ownList = await listNotificationsForUser({ actorUserId: userId, organizationId });
      expect(ownList.map(n => n.id)).toEqual([notificationId]);

      const teammateList = await listNotificationsForUser({ actorUserId: teammateId, organizationId });
      expect(teammateList.map(n => n.id)).toEqual([forTeammate.notification.id]);

      const unreadOnly = await listNotificationsForUser({ actorUserId: userId, organizationId, unreadOnly: true });
      expect(unreadOnly.map(n => n.id)).toEqual([notificationId]);

      const categoryFiltered = await listNotificationsForUser({ actorUserId: userId, organizationId, category: "finance" });
      expect(categoryFiltered.map(n => n.id)).toEqual([notificationId]);

      // --- cross-tenant list isolation ---
      const otherOrgList = await listNotificationsForUser({ actorUserId: otherOrgUserId, organizationId: otherOrgId });
      expect(otherOrgList).toEqual([]);

      // --- mark-read: only the recipient can mark their own notification ---
      await expect(executeNotificationMarkRead({
        actorUserId: teammateId,
        organizationId,
        idempotencyKey: `notif-markread-wrong-user-${suffix}`,
        notificationId
      })).rejects.toMatchObject({ code: "NOTIFICATION_NOT_FOUND" });

      const stillUnread = await db.notification.findUnique({ where: { id: notificationId } });
      expect(stillUnread?.readAt).toBeNull();

      // --- mark-read: authorized + verified readback ---
      const markReadKey = `notif-markread-${suffix}`;

      const marked = await executeNotificationMarkRead({
        actorUserId: userId,
        organizationId,
        idempotencyKey: markReadKey,
        notificationId
      });

      expect(marked.action).toBe("notification.mark_read");
      expect(marked.verified).toBe(true);
      expect(marked.replayed).toBe(false);
      expect(marked.notification.readAt).not.toBeNull();

      const persisted = await db.notification.findUnique({ where: { id: notificationId } });
      expect(persisted?.readAt).not.toBeNull();

      // --- mark-read: exact replay is idempotent, doesn't move readAt ---
      const markReadReplay = await executeNotificationMarkRead({
        actorUserId: userId,
        organizationId,
        idempotencyKey: markReadKey,
        notificationId
      });

      expect(markReadReplay.replayed).toBe(true);
      expect(markReadReplay.notification.readAt).toBe(marked.notification.readAt);

      const afterUnreadOnly = await listNotificationsForUser({ actorUserId: userId, organizationId, unreadOnly: true });
      expect(afterUnreadOnly).toEqual([]);

      // --- mark-read: nonexistent notification ---
      await expect(executeNotificationMarkRead({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `notif-markread-missing-${suffix}`,
        notificationId: `does-not-exist-${suffix}`
      })).rejects.toMatchObject({ code: "NOTIFICATION_NOT_FOUND" });

      const execution = await db.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId,
            actionType: "notification.mark_read",
            idempotencyKey: markReadKey
          }
        }
      });

      expect(execution?.status).toBe("VERIFIED");
      expect(execution?.resourceId).toBe(notificationId);
    } finally {
      await db.actionExecution.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.notification.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.organizationMember.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.user.deleteMany({ where: { id: { in: [userId, teammateId, otherOrgUserId] } } });
      await db.organization.deleteMany({ where: { id: { in: [organizationId, otherOrgId] } } });
    }
  });
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
