import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  gmailConnection: { findFirst: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/integrations/gmail/gmail-oauth.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/gmail/gmail-oauth.service")>();
  return { ...actual, encryptToken: (value: string) => `enc:${value}`, decryptToken: (value: string) => value.replace("enc:", ""), googleOAuthConfig: () => ({ clientId: "id", clientSecret: "secret", redirectUri: "uri" }) };
});

import { getCalendarEventDetail, listUpcomingCalendarEvents } from "../google-calendar.service";

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
});
