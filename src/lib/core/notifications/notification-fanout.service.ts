import { listActiveNotificationRecipientRecords } from "@/lib/core/organization-members/organization-member.repository";
import { findUserRecordById } from "@/lib/core/users/user.repository";
import { resolveActorDisplayName } from "@/lib/core/users/user-display-name";
import type { CreateNotificationInput, NotificationResult } from "./notification.types";
import { notify } from "./notification.service";
import { resolveNotificationRecipient, type NotificationRecipientResolution } from "./notification-recipient-resolver";

export type NotificationFanoutResult = Readonly<{ notifications: NotificationResult[]; additionalTargetResolutions: ReadonlyArray<{ target: string; resolution: NotificationRecipientResolution }> }>;

/** Delivers a business-critical event to its direct recipient and active leadership without duplicates. */
export async function notifyWithOwnerFanout(input: CreateNotificationInput & { actorUserId?: string; additionalTargets?: string[] }): Promise<NotificationFanoutResult> {
  // Stage 1 Production Reliability Closure: these two calls, and the
  // notify() calls below, run against the same single-connection Prisma
  // adapter every other tool/handler in a turn also shares (see
  // executive-agent/runtime.ts's toolExecution.maxFunctionToolConcurrency
  // comment for the full trace). Promise.all here raced two/N queries on
  // that one connection — confirmed in production by a real pg
  // "client.query() when the client is already executing a query" warning.
  // Sequential awaits are always correct (same queries, same results) and
  // remove this function's own contribution to the race regardless of
  // what else is running concurrently elsewhere.
  const members = await listActiveNotificationRecipientRecords(input.organizationId);
  const actor = input.actorUserId ? await findUserRecordById(input.actorUserId) : null;
  const actorName = resolveActorDisplayName(actor);
  const recipients = new Set<string>();
  if (input.recipientUserId) recipients.add(input.recipientUserId);
  for (const member of members) if (member.role === "OWNER" || member.role === "EXECUTIVE") recipients.add(member.userId);
  const additionalTargetResolutions = (input.additionalTargets ?? []).map((target) => ({ target, resolution: resolveNotificationRecipient(target, members) }));
  for (const item of additionalTargetResolutions) if (item.resolution.status === "RESOLVED") recipients.add(item.resolution.recipient.userId);
  const payload: CreateNotificationInput = { organizationId: input.organizationId, recipientUserId: input.recipientUserId, type: input.type, title: `${actorName} · ${input.title}`, body: input.body, severity: input.severity, entityType: input.entityType, entityId: input.entityId };
  const notifications: NotificationResult[] = [];
  if (recipients.size === 0) {
    notifications.push(await notify(payload));
  } else {
    for (const recipientUserId of recipients) notifications.push(await notify({ ...payload, recipientUserId }));
  }
  return { notifications, additionalTargetResolutions };
}
