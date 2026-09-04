import { getValidGoogleAccessToken, googleJson } from "@/lib/integrations/gmail/gmail.service";
import { prisma } from "@/lib/core/shared/prisma";
import type { CalendarRetrievalContext, GoogleCalendarEventSource } from "./google-calendar.types";

export { isExplicitGoogleCalendarRequest } from "./google-calendar-request-detection";

// Smallest viable read surface for the first pilot: the user's own primary
// calendar only — no multi-calendar enumeration, no write. Shares the exact
// same Google OAuth token (GmailConnection, via getValidGoogleAccessToken)
// as Gmail; this file has no OAuth/token logic of its own.
const MAX_EVENTS = 10;

type GoogleCalendarEventTime = { dateTime?: string; date?: string };
type GoogleCalendarEventItem = {
  id: string;
  summary?: string;
  description?: string;
  start?: GoogleCalendarEventTime;
  end?: GoogleCalendarEventTime;
  attendees?: Array<{ email?: string }>;
  htmlLink?: string;
};
type GoogleCalendarEventList = { items?: GoogleCalendarEventItem[] };

function toEventSource(item: GoogleCalendarEventItem): GoogleCalendarEventSource {
  return {
    provider: "google-calendar",
    eventId: item.id,
    calendarId: "primary",
    title: item.summary || "(Başlıksız etkinlik)",
    description: (item.description ?? "").slice(0, 1000),
    startAt: item.start?.dateTime ?? item.start?.date ?? "",
    endAt: item.end?.dateTime ?? item.end?.date ?? "",
    attendees: (item.attendees ?? []).map((attendee) => attendee.email).filter((email): email is string => Boolean(email)),
    htmlLink: item.htmlLink ?? "",
  };
}

/**
 * Records success/failure on the SAME GmailConnection row Gmail itself
 * updates (see gmail.service.ts's fetchAndRecordGmailMessages) — one
 * shared health signal for the one shared Google connection, not a second,
 * Calendar-only bookkeeping trail.
 */
async function withValidToken<T>(input: { organizationId: string; userId: string }, run: (token: string) => Promise<T>): Promise<{ status: "OK"; value: T } | { status: Exclude<CalendarRetrievalContext["status"], "OK" | "NO_RESULTS"> }> {
  const tokenResult = await getValidGoogleAccessToken(input);
  if (tokenResult.status !== "OK") return { status: tokenResult.status };
  try {
    const value = await run(tokenResult.token);
    await prisma.gmailConnection.update({ where: { id: tokenResult.connectionId, organizationId: input.organizationId }, data: { lastSuccessfulAccessAt: new Date(), status: "CONNECTED", lastErrorAt: null, lastErrorCode: null } });
    return { status: "OK", value };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 80) : "GOOGLE_CALENDAR_UNAVAILABLE";
    await prisma.gmailConnection.update({ where: { id: tokenResult.connectionId, organizationId: input.organizationId }, data: { status: "RECONNECT_REQUIRED", lastErrorAt: new Date(), lastErrorCode: code } });
    return { status: code.includes("GOOGLE_401") ? "RECONNECT_REQUIRED" : "UNAVAILABLE" };
  }
}

/**
 * Upcoming events on the connected user's primary calendar — "calendar
 * list/read" + "upcoming events query" + (via rangeDays) "calendar.range".
 * `query` runs Google's own full-text search (summary/description/
 * attendees/location) for entity-linked lookups ("Atlas ile ilgili
 * toplantı") — no client-side attendee matching invented here.
 */
export async function listUpcomingCalendarEvents(input: { organizationId: string; userId: string; maxResults?: number; rangeDays?: number; query?: string }): Promise<CalendarRetrievalContext> {
  const retrievedAt = new Date().toISOString();
  const limit = Math.min(input.maxResults ?? MAX_EVENTS, MAX_EVENTS);
  const result = await withValidToken(input, async (token) => {
    const params = new URLSearchParams({ timeMin: retrievedAt, maxResults: String(limit), singleEvents: "true", orderBy: "startTime" });
    if (input.rangeDays && input.rangeDays > 0) params.set("timeMax", new Date(Date.now() + input.rangeDays * 86_400_000).toISOString());
    if (input.query?.trim()) params.set("q", input.query.trim());
    const list = await googleJson<GoogleCalendarEventList>(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    return (list.items ?? []).slice(0, limit).map(toEventSource);
  });
  if (result.status !== "OK") return { status: result.status, retrievedAt, events: [] };
  return { status: result.value.length ? "OK" : "NO_RESULTS", retrievedAt, events: result.value };
}

/** A single event's detail — "event detail/read". */
export async function getCalendarEventDetail(input: { organizationId: string; userId: string; eventId: string }): Promise<CalendarRetrievalContext> {
  const retrievedAt = new Date().toISOString();
  const result = await withValidToken(input, async (token) => {
    const item = await googleJson<GoogleCalendarEventItem>(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(input.eventId)}`, { headers: { Authorization: `Bearer ${token}` } });
    return [toEventSource(item)];
  });
  if (result.status !== "OK") return { status: result.status, retrievedAt, events: [] };
  return { status: result.value.length ? "OK" : "NO_RESULTS", retrievedAt, events: result.value };
}
