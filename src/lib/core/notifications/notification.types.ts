import type { Notification, NotificationSeverity } from "@prisma/client";

export type NotificationResult = Notification;

export type CreateNotificationInput = {
  organizationId: string;
  recipientUserId?: string;
  type: string;
  title: string;
  body?: string;
  severity?: NotificationSeverity;
  entityType?: string;
  entityId?: string;
};

export type ListNotificationsInput = {
  organizationId: string;
  recipientUserId?: string;
  unreadOnly?: boolean;
};
