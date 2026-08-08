import { listActiveNotificationRecipientRecords } from "@/lib/core/organization-members/organization-member.repository";
import { findUserRecordById } from "@/lib/core/users/user.repository";
import type { CreateNotificationInput, NotificationResult } from "./notification.types";
import { notify } from "./notification.service";
import { resolveNotificationRecipient, type NotificationRecipientResolution } from "./notification-recipient-resolver";

export type NotificationFanoutResult = Readonly<{ notifications: NotificationResult[]; additionalTargetResolutions: ReadonlyArray<{ target: string; resolution: NotificationRecipientResolution }> }>;

/** Delivers a business-critical event to its direct recipient and active leadership without duplicates. */
export async function notifyWithOwnerFanout(input: CreateNotificationInput & { actorUserId?: string; additionalTargets?: string[] }): Promise<NotificationFanoutResult> {
  const [members, actor] = await Promise.all([
    listActiveNotificationRecipientRecords(input.organizationId),
    input.actorUserId ? findUserRecordById(input.actorUserId) : Promise.resolve(null),
  ]);
  const actorName = actor?.fullName?.trim() || "Bir ekip üyesi";
  const recipients = new Set<string>();
  if (input.recipientUserId) recipients.add(input.recipientUserId);
  for (const member of members) if (member.role === "OWNER" || member.role === "EXECUTIVE") recipients.add(member.userId);
  const additionalTargetResolutions = (input.additionalTargets ?? []).map((target) => ({ target, resolution: resolveNotificationRecipient(target, members) }));
  for (const item of additionalTargetResolutions) if (item.resolution.status === "RESOLVED") recipients.add(item.resolution.recipient.userId);
  const payload: CreateNotificationInput = { organizationId: input.organizationId, recipientUserId: input.recipientUserId, type: input.type, title: `${actorName} · ${input.title}`, body: input.body, severity: input.severity, entityType: input.entityType, entityId: input.entityId };
  const notifications = recipients.size === 0 ? [await notify(payload)] : await Promise.all([...recipients].map((recipientUserId) => notify({ ...payload, recipientUserId })));
  return { notifications, additionalTargetResolutions };
}
