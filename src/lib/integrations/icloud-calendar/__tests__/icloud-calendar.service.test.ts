import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
}));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { icloudConnection: db } }));

const caldav = vi.hoisted(() => ({
  discoverCalDAVHome: vi.fn(),
  listCalendarCollections: vi.fn(),
  queryEventsInRange: vi.fn(),
}));
vi.mock("../caldav-client", () => caldav);

process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = "0".repeat(64);

const { decryptIntegrationSecret } = await import("../../integration-secret-crypto");
const { connectIcloudCalendar, disconnectIcloudCalendar, getIcloudCalendarStatus, listIcloudCalendarEventsInRange } = await import("../icloud-calendar.service");

beforeEach(() => {
  vi.clearAllMocks();
  db.update.mockResolvedValue({});
});

describe("connectIcloudCalendar", () => {
  it("A) never stores a plaintext app-specific password — the stored value only recovers the original through the real decrypt function", async () => {
    caldav.discoverCalDAVHome.mockResolvedValue({ status: "OK", principalUrl: "https://caldav.icloud.com/123/principal/", homeSetUrl: "https://p1-caldav.icloud.com/123/calendars/" });
    db.upsert.mockResolvedValue({});

    await connectIcloudCalendar({ organizationId: "org-1", userId: "user-1", appleId: "user@icloud.com", appSpecificPassword: "abcd-efgh-ijkl-mnop" });

    const [call] = db.upsert.mock.calls;
    const storedSecret: string = call[0].create.appSpecificPasswordEncrypted;
    expect(storedSecret).not.toContain("abcd-efgh-ijkl-mnop");
    expect(decryptIntegrationSecret(storedSecret)).toBe("abcd-efgh-ijkl-mnop");
  });

  it("A) scopes the stored connection to exactly the given organization and user (tenant isolation)", async () => {
    caldav.discoverCalDAVHome.mockResolvedValue({ status: "OK", principalUrl: "p", homeSetUrl: "h" });
    db.upsert.mockResolvedValue({});
    await connectIcloudCalendar({ organizationId: "org-42", userId: "user-77", appleId: "user@icloud.com", appSpecificPassword: "pw" });
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId_userId: { organizationId: "org-42", userId: "user-77" } } }));
  });

  it("B) never stores anything when the credential fails CalDAV auth — a wrong (e.g. primary Apple Account) password is proven bad before persistence, not after", async () => {
    caldav.discoverCalDAVHome.mockResolvedValue({ status: "AUTH_REQUIRED" });
    await expect(connectIcloudCalendar({ organizationId: "org-1", userId: "user-1", appleId: "user@icloud.com", appSpecificPassword: "my-normal-apple-password" })).rejects.toThrow("ICLOUD_AUTH_REQUIRED");
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("rejects empty credentials before ever calling CalDAV", async () => {
    await expect(connectIcloudCalendar({ organizationId: "org-1", userId: "user-1", appleId: "", appSpecificPassword: "" })).rejects.toThrow("ICLOUD_CREDENTIALS_MISSING");
    expect(caldav.discoverCalDAVHome).not.toHaveBeenCalled();
  });
});

describe("getIcloudCalendarStatus / disconnectIcloudCalendar", () => {
  it("reports NOT_CONNECTED with no row", async () => {
    db.findUnique.mockResolvedValue(null);
    expect(await getIcloudCalendarStatus("org-1", "user-1")).toMatchObject({ connected: false, status: "NOT_CONNECTED" });
  });

  it("never exposes the encrypted secret in the status shape", async () => {
    db.findUnique.mockResolvedValue({ appleId: "user@icloud.com", appSpecificPasswordEncrypted: "should-never-appear", status: "CONNECTED", connectedAt: new Date("2026-09-04T00:00:00Z"), lastSuccessfulAccessAt: null, lastErrorCode: null });
    const status = await getIcloudCalendarStatus("org-1", "user-1");
    expect(JSON.stringify(status)).not.toContain("should-never-appear");
  });

  it("disconnect deletes exactly the org+user's own row (tenant isolation)", async () => {
    db.deleteMany.mockResolvedValue({ count: 1 });
    await disconnectIcloudCalendar("org-1", "user-1");
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", userId: "user-1" } });
  });
});

describe("listIcloudCalendarEventsInRange", () => {
  const RANGE = { organizationId: "org-1", userId: "user-1", rangeStart: "2026-09-04T00:00:00.000Z", rangeEnd: "2026-09-05T00:00:00.000Z" };

  it("D) maps a real iCloud event into the canonical event source shape", async () => {
    db.findUnique.mockResolvedValue({ id: "conn-1", appleId: "user@icloud.com", appSpecificPasswordEncrypted: (await import("../../integration-secret-crypto")).encryptIntegrationSecret("pw"), caldavHomeSetUrl: "https://p1-caldav.icloud.com/123/calendars/" });
    caldav.listCalendarCollections.mockResolvedValue({ status: "OK", calendarUrls: ["https://p1-caldav.icloud.com/123/calendars/home/"] });
    caldav.queryEventsInRange.mockResolvedValue({ status: "OK", events: [{ uid: "evt-1", calendarUrl: "https://p1-caldav.icloud.com/123/calendars/home/", summary: "METRIX ICLOUD TEST", description: "", startAt: "2026-09-04T21:30:00.000Z", endAt: "2026-09-04T22:30:00.000Z", allDay: false, status: "CONFIRMED" }] });

    const result = await listIcloudCalendarEventsInRange(RANGE);

    expect(result.status).toBe("OK");
    expect(result.events).toEqual([{ provider: "icloud-calendar", eventId: "evt-1", calendarId: "https://p1-caldav.icloud.com/123/calendars/home/", title: "METRIX ICLOUD TEST", description: "", startAt: "2026-09-04T21:30:00.000Z", endAt: "2026-09-04T22:30:00.000Z", allDay: false, attendees: [], htmlLink: "", status: "CONFIRMED" }]);
  });

  it("returns NOT_CONNECTED, never a fake empty calendar, when there is no stored connection", async () => {
    db.findUnique.mockResolvedValue(null);
    const result = await listIcloudCalendarEventsInRange(RANGE);
    expect(result).toMatchObject({ status: "NOT_CONNECTED", events: [] });
    expect(caldav.listCalendarCollections).not.toHaveBeenCalled();
  });

  it("AUTH_REQUIRED (revoked/failed credential) is reported honestly, never masquerades as an empty-but-complete calendar", async () => {
    db.findUnique.mockResolvedValue({ id: "conn-1", appleId: "user@icloud.com", appSpecificPasswordEncrypted: (await import("../../integration-secret-crypto")).encryptIntegrationSecret("pw"), caldavHomeSetUrl: "https://p1-caldav.icloud.com/123/calendars/" });
    caldav.listCalendarCollections.mockResolvedValue({ status: "AUTH_REQUIRED" });
    const result = await listIcloudCalendarEventsInRange(RANGE);
    expect(result).toMatchObject({ status: "AUTH_REQUIRED", events: [] });
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "AUTH_REQUIRED" }) }));
  });

  it("L) never logs the decrypted app-specific password anywhere console can capture it", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.findUnique.mockResolvedValue({ id: "conn-1", appleId: "user@icloud.com", appSpecificPasswordEncrypted: (await import("../../integration-secret-crypto")).encryptIntegrationSecret("super-secret-pw"), caldavHomeSetUrl: "https://p1-caldav.icloud.com/123/calendars/" });
    caldav.listCalendarCollections.mockResolvedValue({ status: "OK", calendarUrls: [] });
    await listIcloudCalendarEventsInRange(RANGE);
    const logged = JSON.stringify([...consoleSpy.mock.calls, ...consoleErrorSpy.mock.calls]);
    expect(logged).not.toContain("super-secret-pw");
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
