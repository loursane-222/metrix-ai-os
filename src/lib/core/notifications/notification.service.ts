import { ApiValidationError } from "@/lib/api/validation";

import {
  countUnreadNotifications,
  createNotification,
  getNotificationById,
  listNotificationsForOrganization,
  markNotificationRead,
} from "./notification.repository";

import type { CreateNotificationInput, ListNotificationsInput, NotificationResult } from "./notification.types";

/**
 * Canonical entry point every other domain calls to raise a notification.
 * This is the single notification authority referenced by the "Notification
 * sistemine bağla" step for all subsequent domains — no domain should write
 * to the Notification model directly.
 */
export async function notify(input: CreateNotificationInput): Promise<NotificationResult> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.type, "type");
  assertNonEmpty(input.title, "title");

  return createNotification(input);
}


export async function listNotifications(
  input: ListNotificationsInput,
): Promise<NotificationResult[]> {
  assertNonEmpty(input.organizationId, "organizationId");
  return listNotificationsForOrganization(input);
}

export async function getUnreadNotificationCount(
  organizationId: string,
  recipientUserId?: string,
): Promise<number> {
  assertNonEmpty(organizationId, "organizationId");
  return countUnreadNotifications(organizationId, recipientUserId);
}

export async function markNotificationAsRead(
  organizationId: string,
  notificationId: string,
): Promise<NotificationResult> {
  assertNonEmpty(organizationId, "organizationId");
  assertNonEmpty(notificationId, "notificationId");

  const existing = await getNotificationById(organizationId, notificationId);
  if (!existing) {
    throw new ApiValidationError("Notification not found.", 404);
  }
  if (existing.isRead) {
    return existing;
  }

  return markNotificationRead(organizationId, notificationId, new Date());
}

function assertNonEmpty(value: string | undefined, field: string): asserts value is string {
  if (!value || value.trim().length === 0) {
    throw new ApiValidationError(`${field} is required.`);
  }
}
