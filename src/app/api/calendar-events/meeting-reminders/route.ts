import { ok, fail } from "@/lib/api/response";
import { sendMeetingReminders } from "@/lib/core/calendar/calendar-meeting-reminder.service";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(request: Request): boolean {
  const secret = process.env.MEETING_REMINDER_CRON_SECRET ?? process.env.CRON_SECRET ?? null;

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("Authorization");
  return authHeader === `Bearer ${secret}`;
}

// ─── POST /api/calendar-events/meeting-reminders ─────────────────────────────

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return fail("Unauthorized", 401);
  }

  try {
    const results = await sendMeetingReminders();
    return ok({
      remindersSent: results.length,
      totalRecipients: results.reduce((sum, result) => sum + result.recipientCount, 0),
      results,
    });
  } catch {
    return fail("Meeting reminder dispatch failed", 500);
  }
}
