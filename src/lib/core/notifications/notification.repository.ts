import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { CreateNotificationInput, ListNotificationsInput, NotificationResult } from "./notification.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function createNotification(
  input: CreateNotificationInput,
  tx?: PrismaTransactionClient,
): Promise<NotificationResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.notification.create({
    data: {
      organizationId: input.organizationId,
      recipientUserId: input.recipientUserId,
      type: input.type,
      title: input.title,
      body: input.body,
      severity: input.severity ?? "INFO",
      entityType: input.entityType,
      entityId: input.entityId,
    },
  });
}

export async function listNotificationsForOrganization(
  input: ListNotificationsInput,
): Promise<NotificationResult[]> {
  return prisma.notification.findMany({
    where: {
      organizationId: input.organizationId,
      recipientUserId: input.recipientUserId,
      isRead: input.unreadOnly ? false : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function countUnreadNotifications(
  organizationId: string,
  recipientUserId?: string,
): Promise<number> {
  return prisma.notification.count({
    where: { organizationId, recipientUserId, isRead: false },
  });
}

export async function getNotificationById(
  organizationId: string,
  notificationId: string,
): Promise<NotificationResult | null> {
  return prisma.notification.findFirst({
    where: { id: notificationId, organizationId },
  });
}

export async function markNotificationRead(
  organizationId: string,
  notificationId: string,
  readAt: Date,
): Promise<NotificationResult> {
  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true, readAt },
  });
}
