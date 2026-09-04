import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { getGmailStatus } from "@/lib/integrations/gmail/gmail.service";
import { googleConnectorAdapter } from "@/lib/company-intelligence/google-connector-adapter";
import type { GmailMessageSource } from "@/lib/integrations/gmail/gmail.types";
import type { GoogleCalendarEventSource } from "@/lib/integrations/google-calendar/google-calendar.types";

/**
 * Permanent, authenticated, READ-only acceptance surface: proves — on
 * demand, for the calling user's own connected Google account — that both
 * Gmail and Google Calendar reads actually work end-to-end through the
 * existing Company Intelligence Google connector, not a route-local
 * reimplementation. No raw Google REST call and no direct Prisma token
 * read happen here; every read goes through googleConnectorAdapter.read(),
 * the exact same seam Company Intelligence itself would use. Never returns
 * message/event content (subject, body, attendees, title, description) —
 * only safe counts and timestamps, for integration health/debug use.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? undefined;
    const auth = await requireAuthContextFromCookies(organizationId);

    const status = await getGmailStatus(auth.organization.id, auth.user.id);
    if (!status.connected) {
      return ok({
        connected: false,
        gmailRead: "fail" as const,
        gmailItemCount: 0,
        gmailLatestReceivedAt: null,
        calendarRead: "fail" as const,
        calendarItemCount: 0,
        calendarNextEventStart: null,
        providerEmail: null,
        lastSuccessfulAccessAt: null,
        errors: ["NOT_CONNECTED"],
      });
    }

    const [gmailResult, calendarResult] = await Promise.all([
      googleConnectorAdapter.read({ organizationId: auth.organization.id, factScope: "email.recentMessages", params: { userId: auth.user.id } }),
      googleConnectorAdapter.read({ organizationId: auth.organization.id, factScope: "calendar.upcomingEvents", params: { userId: auth.user.id } }),
    ]);

    const gmailMessages = gmailResult.status === "OK" ? (gmailResult.value as GmailMessageSource[]) : [];
    const calendarEvents = calendarResult.status === "OK" ? (calendarResult.value as GoogleCalendarEventSource[]) : [];

    const errors: string[] = [];
    if (gmailResult.status !== "OK") errors.push(gmailResult.status === "UNAVAILABLE" ? `GMAIL_${gmailResult.errorMessage ?? "UNAVAILABLE"}` : `GMAIL_${gmailResult.status}`);
    if (calendarResult.status !== "OK") errors.push(calendarResult.status === "UNAVAILABLE" ? `CALENDAR_${calendarResult.errorMessage ?? "UNAVAILABLE"}` : `CALENDAR_${calendarResult.status}`);

    // Re-read status after both reads: a successful read already updated
    // lastSuccessfulAccessAt via the existing GmailConnection mechanism
    // (see gmail.service.ts / google-calendar.service.ts) — this reports
    // that real, persisted value rather than re-deriving one here.
    const refreshedStatus = await getGmailStatus(auth.organization.id, auth.user.id);

    return ok({
      connected: true,
      gmailRead: gmailResult.status === "OK" ? ("success" as const) : ("fail" as const),
      gmailItemCount: gmailMessages.length,
      gmailLatestReceivedAt: gmailMessages[0]?.receivedAt ?? null,
      calendarRead: calendarResult.status === "OK" ? ("success" as const) : ("fail" as const),
      calendarItemCount: calendarEvents.length,
      calendarNextEventStart: calendarEvents[0]?.startAt ?? null,
      providerEmail: refreshedStatus.providerEmail,
      lastSuccessfulAccessAt: refreshedStatus.lastSuccessfulAccessAt,
      errors,
    });
  } catch (error) {
    return authFail(error);
  }
}
