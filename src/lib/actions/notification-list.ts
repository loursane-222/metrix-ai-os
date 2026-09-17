import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";

const MAX_RESULTS = 50;

export type NotificationListItem = {
  id: string;
  category: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  title: string;
  body: string | null;
  sourceType: string | null;
  sourceId: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function listNotificationsForUser(input: {
  actorUserId: string;
  organizationId: string;
  category?: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  unreadOnly?: boolean;
}): Promise<NotificationListItem[]> {
  await requireOrganizationAccess({ userId: input.actorUserId, organizationId: input.organizationId });

  const notifications = await db.notification.findMany({
    where: {
      organizationId: input.organizationId,
      userId: input.actorUserId,
      ...(input.category ? { category: input.category } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.unreadOnly ? { readAt: null } : {})
    },
    orderBy: [{ createdAt: "desc" }],
    take: MAX_RESULTS
  });

  return notifications.map(notification => ({
    id: notification.id,
    category: notification.category,
    priority: notification.priority,
    title: notification.title,
    body: notification.body,
    sourceType: notification.sourceType,
    sourceId: notification.sourceId,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString()
  }));
}
