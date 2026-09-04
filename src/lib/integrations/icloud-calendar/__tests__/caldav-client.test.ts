import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverCalDAVHome, listCalendarCollections, queryEventsInRange } from "../caldav-client";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function xmlResponse(status: number, text: string): Response {
  return { status, text: () => Promise.resolve(text) } as unknown as Response;
}

const PRINCIPAL_XML = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/1234567890/principal/</d:href></d:current-user-principal></d:prop></d:propstat></d:response></d:multistatus>`;
const HOMESET_XML = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/1234567890/principal/</d:href><d:propstat><d:prop><c:calendar-home-set><d:href>https://p36-caldav.icloud.com/1234567890/calendars/</d:href></c:calendar-home-set></d:prop></d:propstat></d:response></d:multistatus>`;
const COLLECTIONS_XML = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
<d:response><d:href>https://p36-caldav.icloud.com/1234567890/calendars/home/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>home</d:displayname></d:prop></d:propstat></d:response>
<d:response><d:href>https://p36-caldav.icloud.com/1234567890/calendars/inbox/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:schedule-inbox/></d:resourcetype></d:prop></d:propstat></d:response>
<d:response><d:href>https://p36-caldav.icloud.com/1234567890/calendars/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
</d:multistatus>`;

describe("discoverCalDAVHome", () => {
  it("resolves principal -> calendar-home-set -> calendar collections without hard-coding any partition host", async () => {
    fetchMock
      .mockResolvedValueOnce(xmlResponse(207, PRINCIPAL_XML))
      .mockResolvedValueOnce(xmlResponse(207, HOMESET_XML))
      .mockResolvedValueOnce(xmlResponse(207, COLLECTIONS_XML));

    const result = await discoverCalDAVHome("user@icloud.com", "app-specific-pw");

    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("unreachable");
    expect(result.principalUrl).toBe("https://caldav.icloud.com/1234567890/principal/");
    expect(result.homeSetUrl).toBe("https://p36-caldav.icloud.com/1234567890/calendars/");
    // Real user calendar only — the schedule-inbox special collection and
    // the bare home-set collection itself (no calendar resourcetype) are
    // both excluded, never treated as a source of narrated/Workspace events.
    expect(result.calendarUrls).toEqual(["https://p36-caldav.icloud.com/1234567890/calendars/home/"]);

    // Discovery starts only from the well-known entry point — every
    // subsequent request target came from a server response, not a
    // hard-coded guess at the per-account partition host.
    expect(fetchMock.mock.calls[0][0]).toBe("https://caldav.icloud.com/");
  });

  it("reports AUTH_REQUIRED on 401 rather than a generic failure — a wrong (e.g. primary Apple) password must be distinguishable", async () => {
    fetchMock.mockResolvedValueOnce(xmlResponse(401, ""));
    const result = await discoverCalDAVHome("user@icloud.com", "wrong-password");
    expect(result.status).toBe("AUTH_REQUIRED");
  });

  it("reports UNAVAILABLE, not AUTH_REQUIRED, on a real server error", async () => {
    fetchMock.mockResolvedValueOnce(xmlResponse(500, ""));
    const result = await discoverCalDAVHome("user@icloud.com", "pw");
    expect(result.status).toBe("UNAVAILABLE");
  });
});

describe("listCalendarCollections", () => {
  it("uses Basic auth over the given home set URL with Depth:1, single request", async () => {
    fetchMock.mockResolvedValueOnce(xmlResponse(207, COLLECTIONS_XML));
    const result = await listCalendarCollections("user@icloud.com", "pw", "https://p36-caldav.icloud.com/1234567890/calendars/");
    expect(result.status).toBe("OK");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Depth).toBe("1");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("user@icloud.com:pw").toString("base64")}`);
  });
});

const REPORT_XML_UTC = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/cal/evt1.ics</d:href><d:propstat><d:prop><c:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:evt-1
SUMMARY:Metrix test
DTSTART:20260904T213000Z
DTEND:20260904T223000Z
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR
</c:calendar-data></d:prop></d:propstat></d:response></d:multistatus>`;

const REPORT_XML_TZID = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/cal/evt2.ics</d:href><d:propstat><d:prop><c:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:evt-2
SUMMARY:Yerel saat toplantısı
DTSTART;TZID=Europe/Istanbul:20260904T213000
DTEND;TZID=Europe/Istanbul:20260904T223000
END:VEVENT
END:VCALENDAR
</c:calendar-data></d:prop></d:propstat></d:response></d:multistatus>`;

const REPORT_XML_ALLDAY = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/cal/evt3.ics</d:href><d:propstat><d:prop><c:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:evt-3
SUMMARY:Tüm gün etkinlik
DTSTART;VALUE=DATE:20260904
DTEND;VALUE=DATE:20260905
END:VEVENT
END:VCALENDAR
</c:calendar-data></d:prop></d:propstat></d:response></d:multistatus>`;

describe("queryEventsInRange — VEVENT parsing", () => {
  const RANGE = { rangeStart: new Date("2026-09-04T00:00:00.000Z"), rangeEnd: new Date("2026-09-05T00:00:00.000Z") };

  it("parses a UTC (Z) DTSTART/DTEND event with exact minute precision", async () => {
    fetchMock.mockResolvedValueOnce(xmlResponse(207, REPORT_XML_UTC));
    const result = await queryEventsInRange({ appleId: "user@icloud.com", appSpecificPassword: "pw", calendarUrls: ["https://p36-caldav.icloud.com/1234567890/calendars/home/"], ...RANGE });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("unreachable");
    expect(result.events).toEqual([{ uid: "evt-1", calendarUrl: "https://p36-caldav.icloud.com/1234567890/calendars/home/", summary: "Metrix test", description: "", startAt: "2026-09-04T21:30:00.000Z", endAt: "2026-09-04T22:30:00.000Z", allDay: false, status: "CONFIRMED" }]);
  });

  it("resolves a TZID (Europe/Istanbul, UTC+3) wall-clock time to the correct UTC instant", async () => {
    fetchMock.mockResolvedValueOnce(xmlResponse(207, REPORT_XML_TZID));
    const result = await queryEventsInRange({ appleId: "user@icloud.com", appSpecificPassword: "pw", calendarUrls: ["https://p36-caldav.icloud.com/1234567890/calendars/home/"], ...RANGE });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("unreachable");
    // 21:30 Europe/Istanbul (UTC+3 in September) === 18:30 UTC.
    expect(result.events[0]).toMatchObject({ startAt: "2026-09-04T18:30:00.000Z", endAt: "2026-09-04T19:30:00.000Z" });
  });

  it("marks a VALUE=DATE event as allDay with a midnight-UTC anchor", async () => {
    fetchMock.mockResolvedValueOnce(xmlResponse(207, REPORT_XML_ALLDAY));
    const result = await queryEventsInRange({ appleId: "user@icloud.com", appSpecificPassword: "pw", calendarUrls: ["https://p36-caldav.icloud.com/1234567890/calendars/home/"], ...RANGE });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("unreachable");
    expect(result.events[0]).toMatchObject({ allDay: true, startAt: "2026-09-04T00:00:00.000Z" });
  });

  it("one calendar collection failing does not fail the whole range read when others succeed", async () => {
    fetchMock
      .mockResolvedValueOnce(xmlResponse(500, ""))
      .mockResolvedValueOnce(xmlResponse(207, REPORT_XML_UTC));
    const result = await queryEventsInRange({ appleId: "user@icloud.com", appSpecificPassword: "pw", calendarUrls: ["https://bad/", "https://p36-caldav.icloud.com/1234567890/calendars/home/"], ...RANGE });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });

  it("returns AUTH_REQUIRED, not a silent empty result, on a 401", async () => {
    fetchMock.mockResolvedValueOnce(xmlResponse(401, ""));
    const result = await queryEventsInRange({ appleId: "user@icloud.com", appSpecificPassword: "wrong", calendarUrls: ["https://p36-caldav.icloud.com/1234567890/calendars/home/"], ...RANGE });
    expect(result.status).toBe("AUTH_REQUIRED");
  });
});
