import { getValidGoogleAccessToken, googleJson } from "@/lib/integrations/gmail/gmail.service";
import type { CalendarRetrievalContext, GoogleCalendarEventSource } from "./google-calendar.types";

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

async function withValidToken<T>(input: { organizationId: string; userId: string }, run: (token: string) => Promise<T>): Promise<{ status: "OK"; value: T } | { status: Exclude<CalendarRetrievalContext["status"], "OK" | "NO_RESULTS"> }> {
  const tokenResult = await getValidGoogleAccessToken(input);
  if (tokenResult.status !== "OK") return { status: tokenResult.status };
  try {
    return { status: "OK", value: await run(tokenResult.token) };
  } catch {
    return { status: "UNAVAILABLE" };
  }
}

/** Upcoming events on the connected user's primary calendar — "calendar list/read" + "upcoming events query". */
export async function listUpcomingCalendarEvents(input: { organizationId: string; userId: string; maxResults?: number }): Promise<CalendarRetrievalContext> {
  const retrievedAt = new Date().toISOString();
  const limit = Math.min(input.maxResults ?? MAX_EVENTS, MAX_EVENTS);
  const result = await withValidToken(input, async (token) => {
    const params = new URLSearchParams({ timeMin: retrievedAt, maxResults: String(limit), singleEvents: "true", orderBy: "startTime" });
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
