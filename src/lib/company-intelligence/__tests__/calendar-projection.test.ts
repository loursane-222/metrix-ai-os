import { beforeEach, describe, expect, it, vi } from "vitest";

const { nativeReadMock, googleReadMock, icloudReadMock, ensureNativeMock, ensureGoogleMock, ensureIcloudMock, telemetryMock } = vi.hoisted(() => ({
  nativeReadMock: vi.fn(),
  googleReadMock: vi.fn(),
  icloudReadMock: vi.fn(),
  ensureNativeMock: vi.fn(),
  ensureGoogleMock: vi.fn(),
  ensureIcloudMock: vi.fn(),
  telemetryMock: vi.fn(),
}));

vi.mock("../native-connector-adapter", () => ({ nativeConnectorAdapter: { provider: "METRIX", read: nativeReadMock } }));
vi.mock("../google-connector-adapter", () => ({ googleConnectorAdapter: { provider: "GOOGLE", read: googleReadMock } }));
vi.mock("../icloud-connector-adapter", () => ({ icloudConnectorAdapter: { provider: "ICLOUD", read: icloudReadMock } }));
vi.mock("../native-source-bootstrap", () => ({ ensureNativeSourceRegistered: ensureNativeMock }));
vi.mock("../google-source-bootstrap", () => ({ ensureGoogleSourceRegistered: ensureGoogleMock }));
vi.mock("../icloud-source-bootstrap", () => ({ ensureIcloudSourceRegistered: ensureIcloudMock }));
vi.mock("../telemetry", () => ({ emitCompanyIntelligenceTelemetry: telemetryMock }));

import { resolveCanonicalCalendarProjection, toWorkspaceCalendarItem } from "../calendar-projection";

const RANGE = { rangeStart: new Date("2026-09-04T00:00:00.000Z"), rangeEnd: new Date("2026-09-05T00:00:00.000Z") };

const nativeEventRow = { id: "native-1", title: "Native toplantı", startAt: "2026-09-04T08:00:00.000Z", endAt: "2026-09-04T09:00:00.000Z", allDay: false, status: "PLANNED" };
const googleEvent = { provider: "google-calendar" as const, eventId: "evt-1", calendarId: "primary" as const, title: "Metrix test", description: "", startAt: "2026-09-04T18:30:00.000Z", endAt: "2026-09-04T19:30:00.000Z", allDay: false, attendees: [], htmlLink: "https://calendar.google.com/x", status: "CONFIRMED" as const };
const icloudEvent = { provider: "icloud-calendar" as const, eventId: "evt-9", calendarId: "https://p1-caldav.icloud.com/123/calendars/home/", title: "METRIX ICLOUD TEST", description: "", startAt: "2026-09-04T21:30:00.000Z", endAt: "2026-09-04T22:30:00.000Z", allDay: false, attendees: [], htmlLink: "", status: "CONFIRMED" as const };

describe("resolveCanonicalCalendarProjection", () => {
  beforeEach(() => {
    nativeReadMock.mockReset();
    googleReadMock.mockReset();
    icloudReadMock.mockReset();
    ensureNativeMock.mockReset().mockResolvedValue({ id: "src-native" });
    ensureGoogleMock.mockReset().mockResolvedValue({ id: "src-google" });
    ensureIcloudMock.mockReset().mockResolvedValue({ id: "src-icloud" });
    telemetryMock.mockReset();
  });

  it("A) a Google-only event appears in the canonical projection", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "OK", value: [googleEvent], observedAt: "now" });
    icloudReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    const result = await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    expect(result.googleEvents).toHaveLength(1);
    expect(result.googleEvents[0]).toMatchObject({ provider: "GOOGLE", sourceEventId: "evt-1", title: "Metrix test", startAt: "2026-09-04T18:30:00.000Z" });
  });

  it("C) native and Google events are both present together, distinctly attributed", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [nativeEventRow], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "OK", value: [googleEvent], observedAt: "now" });
    icloudReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    const result = await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    expect(result.nativeEvents).toEqual([nativeEventRow]);
    expect(result.googleEvents).toHaveLength(1);
    expect(result.sourceStatuses).toEqual({ METRIX_NATIVE: "OK", GOOGLE: "OK", ICLOUD: "OK" });
  });

  it("D) Google unavailable does not drop or fail native events — the whole query never crashes on one source's failure", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [nativeEventRow], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "UNAVAILABLE", observedAt: "now", errorMessage: "RECONNECT_REQUIRED" });
    icloudReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    const result = await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    expect(result.nativeEvents).toEqual([nativeEventRow]);
    expect(result.googleEvents).toEqual([]);
    expect(result.sourceStatuses).toEqual({ METRIX_NATIVE: "OK", GOOGLE: "UNAVAILABLE", ICLOUD: "OK" });
  });

  it("D) a native source that throws does not take down the Google leg", async () => {
    nativeReadMock.mockRejectedValue(new Error("db exploded"));
    googleReadMock.mockResolvedValue({ status: "OK", value: [googleEvent], observedAt: "now" });
    icloudReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    const result = await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    expect(result.sourceStatuses.METRIX_NATIVE).toBe("UNAVAILABLE");
    expect(result.googleEvents).toHaveLength(1);
  });

  it("D) an iCloud-only event appears in the canonical projection", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    icloudReadMock.mockResolvedValue({ status: "OK", value: [icloudEvent], observedAt: "now" });
    const result = await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    expect(result.icloudEvents).toHaveLength(1);
    expect(result.icloudEvents[0]).toMatchObject({ provider: "ICLOUD", canonicalEventId: "icloud:evt-9", sourceEventId: "evt-9", title: "METRIX ICLOUD TEST", startAt: "2026-09-04T21:30:00.000Z" });
  });

  it("E) native + Google + iCloud all aggregate together in one federated read", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [nativeEventRow], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "OK", value: [googleEvent], observedAt: "now" });
    icloudReadMock.mockResolvedValue({ status: "OK", value: [icloudEvent], observedAt: "now" });
    const result = await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    expect(result.nativeEvents).toEqual([nativeEventRow]);
    expect(result.googleEvents).toHaveLength(1);
    expect(result.icloudEvents).toHaveLength(1);
    expect(result.sourceStatuses).toEqual({ METRIX_NATIVE: "OK", GOOGLE: "OK", ICLOUD: "OK" });
  });

  it("F) iCloud failing does not erase native or Google events — no fuzzy identity guessed between sources either (7)", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [nativeEventRow], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "OK", value: [googleEvent], observedAt: "now" });
    icloudReadMock.mockResolvedValue({ status: "UNAVAILABLE", observedAt: "now", errorMessage: "AUTH_REQUIRED" });
    const result = await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    expect(result.nativeEvents).toEqual([nativeEventRow]);
    expect(result.googleEvents).toHaveLength(1);
    expect(result.icloudEvents).toEqual([]);
    expect(result.sourceStatuses).toEqual({ METRIX_NATIVE: "OK", GOOGLE: "OK", ICLOUD: "UNAVAILABLE" });
  });

  it("F) an iCloud adapter that throws does not take down native or Google", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [nativeEventRow], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "OK", value: [googleEvent], observedAt: "now" });
    icloudReadMock.mockRejectedValue(new Error("caldav network exploded"));
    const result = await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    expect(result.sourceStatuses.ICLOUD).toBe("UNAVAILABLE");
    expect(result.nativeEvents).toEqual([nativeEventRow]);
    expect(result.googleEvents).toHaveLength(1);
  });

  it("E) not-connected is reported honestly, distinct from a genuine failure — never a blanket empty-calendar claim", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "NOT_FOUND", observedAt: "now" });
    icloudReadMock.mockResolvedValue({ status: "NOT_FOUND", observedAt: "now" });
    const result = await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    expect(result.sourceStatuses.GOOGLE).toBe("NOT_CONNECTED");
    expect(result.sourceStatuses.ICLOUD).toBe("NOT_CONNECTED");
  });

  it("G) partial availability is represented honestly per-source — one connected, one not, one down, all distinct", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "NOT_FOUND", observedAt: "now" });
    icloudReadMock.mockResolvedValue({ status: "UNAVAILABLE", observedAt: "now", errorMessage: "AUTH_REQUIRED" });
    const result = await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    expect(result.sourceStatuses).toEqual({ METRIX_NATIVE: "OK", GOOGLE: "NOT_CONNECTED", ICLOUD: "UNAVAILABLE" });
  });

  it("F) scopes every source read and bootstrap call to exactly the given organization and user", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    icloudReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    await resolveCanonicalCalendarProjection({ organizationId: "org-42", userId: "user-77", ...RANGE });
    expect(ensureNativeMock).toHaveBeenCalledWith("org-42");
    expect(ensureGoogleMock).toHaveBeenCalledWith("org-42");
    expect(ensureIcloudMock).toHaveBeenCalledWith("org-42");
    expect(nativeReadMock.mock.calls[0][0].organizationId).toBe("org-42");
    expect(googleReadMock.mock.calls[0][0].organizationId).toBe("org-42");
    expect(googleReadMock.mock.calls[0][0].params.userId).toBe("user-77");
    expect(icloudReadMock.mock.calls[0][0].organizationId).toBe("org-42");
    expect(icloudReadMock.mock.calls[0][0].params.userId).toBe("user-77");
  });

  it("G) queries the exact given range, not an implicit 'now' window — Day/Week/Month all resolve through the same range param", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    icloudReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", rangeStart: RANGE.rangeStart, rangeEnd: RANGE.rangeEnd });
    expect(nativeReadMock.mock.calls[0][0].params).toEqual({ rangeStart: "2026-09-04T00:00:00.000Z", rangeEnd: "2026-09-05T00:00:00.000Z" });
    expect(googleReadMock.mock.calls[0][0].params).toMatchObject({ rangeStart: "2026-09-04T00:00:00.000Z", rangeEnd: "2026-09-05T00:00:00.000Z" });
    expect(icloudReadMock.mock.calls[0][0].params).toMatchObject({ rangeStart: "2026-09-04T00:00:00.000Z", rangeEnd: "2026-09-05T00:00:00.000Z" });
  });

  it("I) is provider-neutral at the call boundary — no Google/native/iCloud-specific branching leaks past this module's own return shape", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "OK", value: [googleEvent], observedAt: "now" });
    icloudReadMock.mockResolvedValue({ status: "OK", value: [icloudEvent], observedAt: "now" });
    const result = await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    expect(Object.keys(result)).toEqual(["nativeEvents", "googleEvents", "icloudEvents", "sourceStatuses"]);
  });

  it("L) never logs event content in telemetry — only counts and statuses", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [nativeEventRow], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "OK", value: [googleEvent], observedAt: "now" });
    icloudReadMock.mockResolvedValue({ status: "OK", value: [icloudEvent], observedAt: "now" });
    await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    const logged = JSON.stringify(telemetryMock.mock.calls);
    expect(logged).not.toContain("Metrix test");
    expect(logged).not.toContain("Native toplantı");
    expect(logged).not.toContain("METRIX ICLOUD TEST");
  });
});

describe("toWorkspaceCalendarItem", () => {
  it("B) projects a Google event into the exact minimal shape CalendarWorkspace.tsx already reads off every row", () => {
    const item = toWorkspaceCalendarItem({ canonicalEventId: "google:evt-1", provider: "GOOGLE", sourceEventId: "evt-1", title: "Metrix test", description: null, startAt: "2026-09-04T18:30:00.000Z", endAt: "2026-09-04T19:30:00.000Z", allDay: false, attendees: [], status: "CONFIRMED", htmlLink: null });
    expect(item).toEqual({ id: "google:evt-1", title: "Metrix test", startAt: "2026-09-04T18:30:00.000Z", occurrenceStartAt: "2026-09-04T18:30:00.000Z", endAt: "2026-09-04T19:30:00.000Z", occurrenceEndAt: "2026-09-04T19:30:00.000Z", allDay: false, status: "PLANNED", provider: "GOOGLE" });
  });

  it("marks a cancelled Google event CANCELLED, not silently dropped", () => {
    const item = toWorkspaceCalendarItem({ canonicalEventId: "google:evt-2", provider: "GOOGLE", sourceEventId: "evt-2", title: "İptal", description: null, startAt: "now", endAt: "now", allDay: false, attendees: [], status: "CANCELLED", htmlLink: null });
    expect(item.status).toBe("CANCELLED");
  });

  it("J) projects an iCloud event with provider: ICLOUD — CalendarWorkspace's existing `canonical: !row.provider` guard makes it non-draggable/read-only the same way a Google event already is, with no iCloud-specific guard needed", () => {
    const item = toWorkspaceCalendarItem({ canonicalEventId: "icloud:evt-9", provider: "ICLOUD", sourceEventId: "evt-9", title: "METRIX ICLOUD TEST", description: null, startAt: "2026-09-04T21:30:00.000Z", endAt: "2026-09-04T22:30:00.000Z", allDay: false, attendees: [], status: "CONFIRMED", htmlLink: null });
    expect(item).toEqual({ id: "icloud:evt-9", title: "METRIX ICLOUD TEST", startAt: "2026-09-04T21:30:00.000Z", occurrenceStartAt: "2026-09-04T21:30:00.000Z", endAt: "2026-09-04T22:30:00.000Z", occurrenceEndAt: "2026-09-04T22:30:00.000Z", allDay: false, status: "PLANNED", provider: "ICLOUD" });
  });
});
