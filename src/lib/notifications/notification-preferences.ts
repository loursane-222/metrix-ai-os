import { db } from "../db";

import { NOTIFICATION_CATEGORY } from "./business-event-notifications";

/**
 * A user's notification DELIVERY preferences.
 *
 * These decide whether a persisted Notification is shown proactively
 * (toast + sound). They never decide whether the Notification exists: the
 * canonical business event is always persisted, so a finance event is not
 * lost because the user silenced Finance. Preferences are per user (never
 * per organization) and identity always comes from the session.
 */
export type NotificationPreferences = {
  critical: boolean;
  finance: boolean;
  sales: boolean;
  tasks: boolean;
  /** "Hiç konuşmasın": silences all proactive delivery. */
  muteAll: boolean;
};

export type NotificationPreferencesPatch = Partial<NotificationPreferences>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  critical: true,
  finance: true,
  sales: true,
  tasks: true,
  muteAll: false
};

const CATEGORY_BY_PREFERENCE = {
  critical: NOTIFICATION_CATEGORY.CRITICAL,
  finance: NOTIFICATION_CATEGORY.FINANCE,
  sales: NOTIFICATION_CATEGORY.SALES,
  tasks: NOTIFICATION_CATEGORY.TASKS
} as const;

const PREFERENCE_SELECT = {
  notifyCritical: true,
  notifyFinance: true,
  notifySales: true,
  notifyTasks: true,
  notifyMuteAll: true,
  notifyDeliverySince: true
} as const;

type PreferenceRow = {
  notifyCritical: boolean;
  notifyFinance: boolean;
  notifySales: boolean;
  notifyTasks: boolean;
  notifyMuteAll: boolean;
  notifyDeliverySince: Date | null;
};

function toPreferences(row: PreferenceRow): NotificationPreferences {
  return {
    critical: row.notifyCritical,
    finance: row.notifyFinance,
    sales: row.notifySales,
    tasks: row.notifyTasks,
    muteAll: row.notifyMuteAll
  };
}

export class NotificationPreferenceVerificationError extends Error {
  readonly code = "PREFERENCE_VERIFICATION_FAILED";

  constructor() {
    super("Notification preferences could not be verified by readback");
    this.name = "NotificationPreferenceVerificationError";
  }
}

export async function loadNotificationPreferences(
  userId: string
): Promise<NotificationPreferences> {
  const row = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: PREFERENCE_SELECT
  });

  return toPreferences(row);
}

/**
 * Updates only the given user's own preferences, then reads them back and
 * verifies the stored values before reporting them. Whenever a change turns
 * proactive delivery (back) ON — mute cleared or a category re-enabled —
 * the delivery cursor moves to now, so notifications that accumulated while
 * it was off are never replayed as a toast storm.
 */
export async function updateNotificationPreferences(input: {
  actorUserId: string;
  patch: NotificationPreferencesPatch;
}): Promise<NotificationPreferences> {
  const current = await db.user.findUniqueOrThrow({
    where: { id: input.actorUserId },
    select: PREFERENCE_SELECT
  });

  const before = toPreferences(current);
  const after: NotificationPreferences = { ...before, ...input.patch };

  const reEnabled =
    (before.muteAll && !after.muteAll) ||
    (["critical", "finance", "sales", "tasks"] as const).some(
      key => !before[key] && after[key]
    );

  await db.user.update({
    where: { id: input.actorUserId },
    data: {
      notifyCritical: after.critical,
      notifyFinance: after.finance,
      notifySales: after.sales,
      notifyTasks: after.tasks,
      notifyMuteAll: after.muteAll,
      ...(reEnabled ? { notifyDeliverySince: new Date() } : {})
    }
  });

  const saved = await loadNotificationPreferences(input.actorUserId);

  if (JSON.stringify(saved) !== JSON.stringify(after)) {
    throw new NotificationPreferenceVerificationError();
  }

  return saved;
}

/**
 * The rule for what may be delivered proactively to this user right now:
 * nothing while muted; otherwise every category the user left enabled
 * (a category with no preference of its own — e.g. a notification the user
 * explicitly asked Sol to create — follows only the mute switch), and only
 * notifications created since the delivery cursor.
 */
export async function loadDeliveryFilter(userId: string): Promise<{
  muted: boolean;
  hiddenCategories: string[];
  since: Date | null;
}> {
  const row = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: PREFERENCE_SELECT
  });

  const preferences = toPreferences(row);

  return {
    muted: preferences.muteAll,
    hiddenCategories: (
      Object.keys(CATEGORY_BY_PREFERENCE) as Array<keyof typeof CATEGORY_BY_PREFERENCE>
    )
      .filter(key => !preferences[key])
      .map(key => CATEGORY_BY_PREFERENCE[key]),
    since: row.notifyDeliverySince
  };
}

export async function listDeliverableNotifications(input: {
  userId: string;
  organizationId: string;
}) {
  const filter = await loadDeliveryFilter(input.userId);

  if (filter.muted) {
    return { notifications: [], unreadCount: 0 };
  }

  const where = {
    organizationId: input.organizationId,
    userId: input.userId,
    readAt: null,
    ...(filter.hiddenCategories.length > 0
      ? { category: { notIn: filter.hiddenCategories } }
      : {}),
    ...(filter.since ? { createdAt: { gte: filter.since } } : {})
  };

  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        category: true,
        priority: true,
        title: true,
        body: true,
        createdAt: true
      }
    }),
    db.notification.count({ where })
  ]);

  return { notifications, unreadCount };
}
