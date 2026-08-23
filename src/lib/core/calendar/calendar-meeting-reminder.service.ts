import { prisma } from "@/lib/core/shared/prisma";
import { notify } from "@/lib/core/notifications/notification.service";
import { listOrganizationIds } from "@/lib/core/organizations/organization.repository";

const REMINDER_LEAD_MINUTES = 15;
const CATCH_UP_GRACE_MINUTES = 5;

export type MeetingReminderResult = {
  eventId: string;
  organizationId: string;
  recipientCount: number;
};

/**
 * Finds MEETING-type calendar events starting within the reminder window that
 * have not yet been reminded, notifies each member participant, and marks the
 * event as reminded so a later run never double-sends for the same event.
 */
export async function sendMeetingReminders(now: Date = new Date()): Promise<MeetingReminderResult[]> {
  const windowEnd = new Date(now.getTime() + REMINDER_LEAD_MINUTES * 60_000);
  const windowStart = new Date(now.getTime() - CATCH_UP_GRACE_MINUTES * 60_000);

  const organizationIds = await listOrganizationIds();
  const results: MeetingReminderResult[] = [];

  for (const organizationId of organizationIds) {
    const events = await prisma.calendarEvent.findMany({
      where: {
        organizationId,
        blockType: "MEETING",
        status: { in: ["PLANNED", "CONFIRMED"] },
        reminderSentAt: null,
        startAt: { gt: windowStart, lte: windowEnd },
      },
      include: {
        participants: {
          where: { memberId: { not: null } },
          select: { memberId: true, member: { select: { userId: true } } },
        },
      },
    });

    for (const event of events) {
      const recipientUserIds = [...new Set(
        event.participants.flatMap((participant) => participant.member ? [participant.member.userId] : []),
      )];

      await Promise.all(recipientUserIds.map((recipientUserId) => notify({
        organizationId: event.organizationId,
        recipientUserId,
        type: "calendar.meeting_reminder",
        title: `Toplantı hatırlatması · ${event.title}`,
        body: formatReminderBody(event.startAt),
        entityType: "CalendarEvent",
        entityId: event.id,
      })));

      await prisma.calendarEvent.update({
        where: { id: event.id, organizationId },
        data: { reminderSentAt: now },
      });

      results.push({ eventId: event.id, organizationId, recipientCount: recipientUserIds.length });
    }
  }

  return results;
}

function formatReminderBody(startAt: Date): string {
  const time = startAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
  return `Saat ${time} itibarıyla başlıyor.`;
}
