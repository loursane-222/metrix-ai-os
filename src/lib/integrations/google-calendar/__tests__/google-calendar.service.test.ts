import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  gmailConnection: { findFirst: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/integrations/gmail/gmail-oauth.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/gmail/gmail-oauth.service")>();
  return { ...actual, encryptToken: (value: string) => `enc:${value}`, decryptToken: (value: string) => value.replace("enc:", ""), googleOAuthConfig: () => ({ clientId: "id", clientSecret: "secret", redirectUri: "uri" }) };
});

import { getCalendarEventDetail, isExplicitGoogleCalendarRequest, listCalendarEventsInRange, listUpcomingCalendarEvents } from "../google-calendar.service";

const connection = {
  id: "connection-1", organizationId: "org-1", userId: "user-1", providerAccountId: "google-1",
  accessTokenEncrypted: "enc:owner-token", refreshTokenEncrypted: "enc:refresh", tokenExpiresAt: new Date(Date.now() + 3_600_000),
};

describe("Google Calendar read-only retrieval — shares Gmail's own token lifecycle, no second OAuth runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("is NOT_CONNECTED when there is no Google connection for this org/user — same GmailConnection lookup as Gmail", async () => {
    prismaMock.gmailConnection.findFirst.mockResolvedValue(null);
    const result = await listUpcomingCalendarEvents({ organizationId: "org-1", userId: "user-1" });
    expect(result).toMatchObject({ status: "NOT_CONNECTED", events: [] });
    expect(prismaMock.gmailConnection.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", userId: "user-1" } }));
  });

  it("lists upcoming primary-calendar events using the connection's real access token", async () => {
    prismaMock.gmailConnection.findFirst.mockResolvedValue(connection);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      items: [
        { id: "evt-1", summary: "Atlas ile görüşme", description: "Teklif takibi", start: { dateTime: "2026-09-10T10:00:00+03:00" }, end: { dateTime: "2026-09-10T10:30:00+03:00" }, attendees: [{ email: "atlas@example.com" }], htmlLink: "https://calendar.google.com/event?eid=evt-1" },
      ],
    }), { status: 200 }));
    const result = await listUpcomingCalendarEvents({ organizationId: "org-1", userId: "user-1" });
    expect(result.status).toBe("OK");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ provider: "google-calendar", eventId: "evt-1", title: "Atlas ile görüşme", attendees: ["atlas@example.com"] });
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("calendars/primary/events");
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ headers: { Authorization: "Bearer owner-token" } });
  });

  it("is NO_RESULTS (not fabricated) when the calendar has no upcoming events", async () => {
    prismaMock.gmailConnection.findFirst.mockResolvedValue(connection);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const result = await listUpcomingCalendarEvents({ organizationId: "org-1", userId: "user-1" });
    expect(result).toMatchObject({ status: "NO_RESULTS", events: [] });
  });

  it("reads a single event's detail by id", async () => {
    prismaMock.gmailConnection.findFirst.mockResolvedValue(connection);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: "evt-9", summary: "Sözleşme imzası", start: { dateTime: "2026-09-12T09:00:00+03:00" }, end: { dateTime: "2026-09-12T09:30:00+03:00" } }), { status: 200 }));
    const result = await getCalendarEventDetail({ organizationId: "org-1", userId: "user-1", eventId: "evt-9" });
    expect(result.status).toBe("OK");
    expect(result.events[0]).toMatchObject({ eventId: "evt-9", title: "Sözleşme imzası" });
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("calendars/primary/events/evt-9");
  });

  it("is RECONNECT_REQUIRED when the shared Google token is invalid — same failure classification as Gmail", async () => {
    prismaMock.gmailConnection.findFirst.mockResolvedValue({ ...connection, tokenExpiresAt: new Date(0) });
    prismaMock.gmailConnection.update.mockResolvedValue(connection);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 401 }));
    const result = await listUpcomingCalendarEvents({ organizationId: "org-1", userId: "user-1" });
    expect(result).toMatchObject({ status: "RECONNECT_REQUIRED", events: [] });
  });

  it("records lastSuccessfulAccessAt on the shared GmailConnection row after a real successful read — same health signal Gmail itself updates", async () => {
    prismaMock.gmailConnection.findFirst.mockResolvedValue(connection);
    prismaMock.gmailConnection.update.mockResolvedValue(connection);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [{ id: "evt-1", summary: "Atlas ile görüşme", start: { dateTime: "2026-09-10T10:00:00+03:00" }, end: { dateTime: "2026-09-10T10:30:00+03:00" } }] }), { status: 200 }));
    await listUpcomingCalendarEvents({ organizationId: "org-1", userId: "user-1" });
    expect(prismaMock.gmailConnection.update).toHaveBeenCalledWith({ where: { id: "connection-1", organizationId: "org-1" }, data: expect.objectContaining({ lastSuccessfulAccessAt: expect.any(Date), status: "CONNECTED" }) });
  });

  it("records a RECONNECT_REQUIRED failure on the shared GmailConnection row when the Calendar REST call itself fails (not just the token refresh)", async () => {
    prismaMock.gmailConnection.findFirst.mockResolvedValue(connection);
    prismaMock.gmailConnection.update.mockResolvedValue(connection);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }));
    const result = await listUpcomingCalendarEvents({ organizationId: "org-1", userId: "user-1" });
    expect(result.status).toBe("RECONNECT_REQUIRED");
    expect(prismaMock.gmailConnection.update).toHaveBeenCalledWith({ where: { id: "connection-1", organizationId: "org-1" }, data: expect.objectContaining({ status: "RECONNECT_REQUIRED", lastErrorCode: "GOOGLE_401" }) });
  });

  it("bounds the query by rangeDays (calendar.range) via Google's own timeMax parameter", async () => {
    prismaMock.gmailConnection.findFirst.mockResolvedValue(connection);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    await listUpcomingCalendarEvents({ organizationId: "org-1", userId: "user-1", rangeDays: 7 });
    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(url.searchParams.has("timeMax")).toBe(true);
  });

  it("passes an entity-linked query straight through to Google's own full-text search — no client-side attendee guessing", async () => {
    prismaMock.gmailConnection.findFirst.mockResolvedValue(connection);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    await listUpcomingCalendarEvents({ organizationId: "org-1", userId: "user-1", query: "atlas@example.com" });
    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(url.searchParams.get("q")).toBe("atlas@example.com");
  });
});

describe("listCalendarEventsInRange — arbitrary window, for Workspace-style Day/Week/Month queries (including past ranges)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("queries Google with the exact given range, not 'now'", async () => {
    prismaMock.gmailConnection.findFirst.mockResolvedValue(connection);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    await listCalendarEventsInRange({ organizationId: "org-1", userId: "user-1", rangeStart: "2026-01-01T00:00:00.000Z", rangeEnd: "2026-01-08T00:00:00.000Z" });
    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(url.searchParams.get("timeMin")).toBe("2026-01-01T00:00:00.000Z");
    expect(url.searchParams.get("timeMax")).toBe("2026-01-08T00:00:00.000Z");
  });

  it("marks a real event's status CANCELLED when Google reports it cancelled — never silently drops or hides it", async () => {
    prismaMock.gmailConnection.findFirst.mockResolvedValue(connection);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [{ id: "evt-1", summary: "İptal edilen görüşme", status: "cancelled", start: { dateTime: "2026-09-10T10:00:00+03:00" }, end: { dateTime: "2026-09-10T10:30:00+03:00" } }] }), { status: 200 }));
    const result = await listCalendarEventsInRange({ organizationId: "org-1", userId: "user-1", rangeStart: "2026-09-01T00:00:00.000Z", rangeEnd: "2026-09-30T00:00:00.000Z" });
    expect(result.events[0]).toMatchObject({ status: "CANCELLED" });
  });

  it("marks an all-day event allDay:true from Google's date-only (no dateTime) field", async () => {
    prismaMock.gmailConnection.findFirst.mockResolvedValue(connection);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [{ id: "evt-2", summary: "Tam gün etkinlik", start: { date: "2026-09-10" }, end: { date: "2026-09-11" } }] }), { status: 200 }));
    const result = await listCalendarEventsInRange({ organizationId: "org-1", userId: "user-1", rangeStart: "2026-09-01T00:00:00.000Z", rangeEnd: "2026-09-30T00:00:00.000Z" });
    expect(result.events[0]).toMatchObject({ allDay: true });
  });
});

describe("isExplicitGoogleCalendarRequest", () => {
  it("recognizes explicit calendar/meeting requests", () => {
    expect(isExplicitGoogleCalendarRequest("Bugün takvimimde ne var?")).toBe(true);
    expect(isExplicitGoogleCalendarRequest("Önümüzdeki hafta önemli toplantılarım hangileri?")).toBe(true);
  });

  it("does not fire for ordinary conversation with no calendar/meeting term", () => {
    expect(isExplicitGoogleCalendarRequest("Satış hedefimiz nasıl gidiyor?")).toBe(false);
  });
});
