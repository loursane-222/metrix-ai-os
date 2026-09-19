import { createHash } from "node:crypto";

import { executeNotificationCreate } from "../actions/notification-create";
import { db } from "../db";

import { NOTIFICATION_CATEGORY } from "./business-event-notifications";

/**
 * Time-based reminders for the two canonical schedule sources — Task.dueAt
 * and (timed) CalendarEvent.startsAt — created SERVER-SIDE by a protected
 * sweep. The browser is only ever a delivery surface; nothing here depends
 * on a client timer.
 *
 * Window rule: an item is reminder-eligible while  now < instant <= now+15m.
 * Any scheduler that runs at least once per lead time therefore cannot miss
 * an item (a run at any point in [instant-15m, instant) catches it), the
 * reminder arrives within one sweep interval of "15 minutes before", and an
 * item that has already started is never reminded late.
 *
 * Idempotency: the Notification identity is (kind, object id, lead, the
 * instant being reminded about, recipient). Re-running the sweep, or a
 * duplicated cron delivery, reuses the existing notification; a moved
 * dueAt/startsAt is a new instant and therefore a new reminder.
 */
export const REMINDER_LEAD_MINUTES = 15;
export const REMINDER_LEAD_MS = REMINDER_LEAD_MINUTES * 60_000;

const MAX_ITEMS_PER_KIND = 500;

export type ReminderKindSummary = {
  considered: number;
  created: number;
  replayed: number;
  skipped: number;
  failed: number;
};

export type ReminderSweepSummary = {
  windowStart: string;
  windowEnd: string;
  tasks: ReminderKindSummary;
  calendarEvents: ReminderKindSummary;
};

function emptySummary(): ReminderKindSummary {
  return { considered: 0, created: 0, replayed: 0, skipped: 0, failed: 0 };
}

function reminderKey(input: {
  kind: "task" | "calendar";
  objectId: string;
  instant: Date;
  recipientUserId: string;
}): string {
  return `rm:${createHash("sha256")
    .update(
      `${input.kind}:${input.objectId}:reminder:${REMINDER_LEAD_MINUTES}m:${input.instant.toISOString()}:${input.recipientUserId}`
    )
    .digest("hex")
    .slice(0, 40)}`;
}

/** HH:mm in the recipient's own timezone — never the server's. */
function formatClock(instant: Date, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

  try {
    return new Intl.DateTimeFormat("tr-TR", { ...options, timeZone: timezone }).format(instant);
  } catch {
    return new Intl.DateTimeFormat("tr-TR", { ...options, timeZone: "UTC" }).format(instant);
  }
}

type Candidate = {
  kind: "task" | "calendar";
  objectId: string;
  organizationId: string;
  recipientUserId: string | null;
  instant: Date;
  title: string;
  priority: "NORMAL" | "HIGH";
};

export async function runReminderSweep(
  now: Date = new Date()
): Promise<ReminderSweepSummary> {
  const windowEnd = new Date(now.getTime() + REMINDER_LEAD_MS);

  const [tasks, events] = await Promise.all([
    db.task.findMany({
      where: { status: "OPEN", dueAt: { gt: now, lte: windowEnd } },
      orderBy: { dueAt: "asc" },
      take: MAX_ITEMS_PER_KIND,
      select: {
        id: true,
        organizationId: true,
        title: true,
        priority: true,
        dueAt: true,
        assignedToUserId: true,
        createdByUserId: true
      }
    }),
    db.calendarEvent.findMany({
      where: { allDay: false, startsAt: { gt: now, lte: windowEnd } },
      orderBy: { startsAt: "asc" },
      take: MAX_ITEMS_PER_KIND,
      select: {
        id: true,
        organizationId: true,
        userId: true,
        title: true,
        startsAt: true
      }
    })
  ]);

  const candidates: Candidate[] = [
    ...tasks.flatMap(task =>
      task.dueAt
        ? [
            {
              kind: "task" as const,
              objectId: task.id,
              organizationId: task.organizationId,
              // The task's real owner: its assignee, else its creator —
              // not every owner/admin of the organization.
              recipientUserId: task.assignedToUserId ?? task.createdByUserId,
              instant: task.dueAt,
              title: task.title,
              priority: task.priority === "HIGH" ? ("HIGH" as const) : ("NORMAL" as const)
            }
          ]
        : []
    ),
    ...events.map(event => ({
      kind: "calendar" as const,
      objectId: event.id,
      organizationId: event.organizationId,
      recipientUserId: event.userId,
      instant: event.startsAt,
      title: event.title,
      priority: "NORMAL" as const
    }))
  ];

  const recipientIds = Array.from(
    new Set(
      candidates
        .map(candidate => candidate.recipientUserId)
        .filter((id): id is string => id !== null)
    )
  );

  // Tenant boundary: a reminder only ever goes to a member of the object's
  // own organization.
  const memberships = recipientIds.length
    ? await db.organizationMember.findMany({
        where: { userId: { in: recipientIds } },
        select: { organizationId: true, userId: true }
      })
    : [];
  const memberKeys = new Set(
    memberships.map(member => `${member.organizationId}:${member.userId}`)
  );

  const users = recipientIds.length
    ? await db.user.findMany({
        where: { id: { in: recipientIds } },
        select: { id: true, timezone: true }
      })
    : [];
  const timezoneByUser = new Map(users.map(user => [user.id, user.timezone]));

  const summary: ReminderSweepSummary = {
    windowStart: now.toISOString(),
    windowEnd: windowEnd.toISOString(),
    tasks: emptySummary(),
    calendarEvents: emptySummary()
  };

  for (const candidate of candidates) {
    const bucket = candidate.kind === "task" ? summary.tasks : summary.calendarEvents;
    bucket.considered += 1;

    const recipient = candidate.recipientUserId;

    if (!recipient || !memberKeys.has(`${candidate.organizationId}:${recipient}`)) {
      bucket.skipped += 1;
      continue;
    }

    const timezone = timezoneByUser.get(recipient) ?? "Europe/Istanbul";
    const clock = formatClock(candidate.instant, timezone);

    try {
      const result = await executeNotificationCreate({
        actorUserId: recipient,
        organizationId: candidate.organizationId,
        userId: recipient,
        idempotencyKey: reminderKey({
          kind: candidate.kind,
          objectId: candidate.objectId,
          instant: candidate.instant,
          recipientUserId: recipient
        }),
        category: NOTIFICATION_CATEGORY.TASKS,
        priority: candidate.priority,
        title: candidate.kind === "task" ? "Görev yaklaşıyor" : "Toplantı yaklaşıyor",
        body: `${candidate.title} — ${clock}`,
        sourceType: candidate.kind === "task" ? "Task" : "CalendarEvent",
        sourceId: candidate.objectId
      });

      if (result.replayed) bucket.replayed += 1;
      else bucket.created += 1;
    } catch {
      bucket.failed += 1;
    }
  }

  return summary;
}
