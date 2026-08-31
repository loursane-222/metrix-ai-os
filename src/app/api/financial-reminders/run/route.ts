import { ok, fail } from "@/lib/api/response";
import { runFinancialReminderScan } from "@/lib/core/calendar/financial-reminder-scheduler.service";

// ─── Auth ─────────────────────────────────────────────────────────────────────
// Identical pattern to /api/calendar-events/meeting-reminders and
// /api/executive-watch/run — a shared/dedicated cron secret bearer token,
// open only outside production.

function isAuthorized(request: Request): boolean {
  const secret = process.env.FINANCIAL_REMINDER_CRON_SECRET ?? process.env.CRON_SECRET ?? null;

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("Authorization");
  return authHeader === `Bearer ${secret}`;
}

// ─── POST /api/financial-reminders/run ────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return fail("Unauthorized", 401);
  }

  try {
    const results = await runFinancialReminderScan();
    return ok({
      remindersSent: results.length,
      totalRecipients: results.reduce((sum, result) => sum + result.recipientCount, 0),
      results,
    });
  } catch {
    return fail("Financial reminder dispatch failed", 500);
  }
}
