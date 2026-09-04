import { beforeEach, describe, expect, it, vi } from "vitest";

const { nativeReadMock, googleReadMock, ensureNativeMock, ensureGoogleMock, telemetryMock } = vi.hoisted(() => ({
  nativeReadMock: vi.fn(),
  googleReadMock: vi.fn(),
  ensureNativeMock: vi.fn(),
  ensureGoogleMock: vi.fn(),
  telemetryMock: vi.fn(),
}));

vi.mock("../native-connector-adapter", () => ({ nativeConnectorAdapter: { provider: "METRIX", read: nativeReadMock } }));
vi.mock("../google-connector-adapter", () => ({ googleConnectorAdapter: { provider: "GOOGLE", read: googleReadMock } }));
vi.mock("../native-source-bootstrap", () => ({ ensureNativeSourceRegistered: ensureNativeMock }));
vi.mock("../google-source-bootstrap", () => ({ ensureGoogleSourceRegistered: ensureGoogleMock }));
vi.mock("../telemetry", () => ({ emitCompanyIntelligenceTelemetry: telemetryMock }));

import { resolveCanonicalCalendarProjection, toWorkspaceCalendarItem } from "../calendar-projection";

const RANGE = { rangeStart: new Date("2026-09-04T00:00:00.000Z"), rangeEnd: new Date("2026-09-05T00:00:00.000Z") };

const nativeEventRow = { id: "native-1", title: "Native toplantı", startAt: "2026-09-04T08:00:00.000Z", endAt: "2026-09-04T09:00:00.000Z", allDay: false, status: "PLANNED" };
const googleEvent = { provider: "google-calendar" as const, eventId: "evt-1", calendarId: "primary" as const, title: "Metrix test", description: "", startAt: "2026-09-04T18:30:00.000Z", endAt: "2026-09-04T19:30:00.000Z", allDay: false, attendees: [], htmlLink: "https://calendar.google.com/x", status: "CONFIRMED" as const };

describe("resolveCanonicalCalendarProjection", () => {
  beforeEach(() => {
    nativeReadMock.mockReset();
    googleReadMock.mockReset();
    ensureNativeMock.mockReset().mockResolvedValue({ id: "src-native" });
    ensureGoogleMock.mockReset().mockResolvedValue({ id: "src-google" });
    telemetryMock.mockReset();
  });

  it("A) a Google-only event appears in the canonical projection", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "OK", value: [googleEvent], observedAt: "now" });
    const result = await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    expect(result.googleEvents).toHaveLength(1);
    expect(result.googleEvents[0]).toMatchObject({ provider: "GOOGLE", sourceEventId: "evt-1", title: "Metrix test", startAt: "2026-09-04T18:30:00.000Z" });
  });

  it("C) native and Google events are both present together, distinctly attributed", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [nativeEventRow], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "OK", value: [googleEvent], observedAt: "now" });
    const result = await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    expect(result.nativeEvents).toEqual([nativeEventRow]);
    expect(result.googleEvents).toHaveLength(1);
    expect(result.sourceStatuses).toEqual({ METRIX_NATIVE: "OK", GOOGLE: "OK" });
  });

  it("D) Google unavailable does not drop or fail native events — the whole query never crashes on one source's failure", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [nativeEventRow], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "UNAVAILABLE", observedAt: "now", errorMessage: "RECONNECT_REQUIRED" });
    const result = await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    expect(result.nativeEvents).toEqual([nativeEventRow]);
    expect(result.googleEvents).toEqual([]);
    expect(result.sourceStatuses).toEqual({ METRIX_NATIVE: "OK", GOOGLE: "UNAVAILABLE" });
  });

  it("D) a native source that throws does not take down the Google leg", async () => {
    nativeReadMock.mockRejectedValue(new Error("db exploded"));
    googleReadMock.mockResolvedValue({ status: "OK", value: [googleEvent], observedAt: "now" });
    const result = await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    expect(result.sourceStatuses.METRIX_NATIVE).toBe("UNAVAILABLE");
    expect(result.googleEvents).toHaveLength(1);
  });

  it("E) not-connected is reported honestly, distinct from a genuine failure — never a blanket empty-calendar claim", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "NOT_FOUND", observedAt: "now" });
    const result = await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    expect(result.sourceStatuses.GOOGLE).toBe("NOT_CONNECTED");
  });

  it("F) scopes both source reads and bootstrap calls to exactly the given organization and user", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    await resolveCanonicalCalendarProjection({ organizationId: "org-42", userId: "user-77", ...RANGE });
    expect(ensureNativeMock).toHaveBeenCalledWith("org-42");
    expect(ensureGoogleMock).toHaveBeenCalledWith("org-42");
    expect(nativeReadMock.mock.calls[0][0].organizationId).toBe("org-42");
    expect(googleReadMock.mock.calls[0][0].organizationId).toBe("org-42");
    expect(googleReadMock.mock.calls[0][0].params.userId).toBe("user-77");
  });

  it("G) queries the exact given range, not an implicit 'now' window — Day/Week/Month all resolve through the same range param", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", rangeStart: RANGE.rangeStart, rangeEnd: RANGE.rangeEnd });
    expect(nativeReadMock.mock.calls[0][0].params).toEqual({ rangeStart: "2026-09-04T00:00:00.000Z", rangeEnd: "2026-09-05T00:00:00.000Z" });
    expect(googleReadMock.mock.calls[0][0].params).toMatchObject({ rangeStart: "2026-09-04T00:00:00.000Z", rangeEnd: "2026-09-05T00:00:00.000Z" });
  });

  it("I) is provider-neutral at the call boundary — no Google/native-specific branching leaks past this module's own return shape", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "OK", value: [googleEvent], observedAt: "now" });
    const result = await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    expect(Object.keys(result)).toEqual(["nativeEvents", "googleEvents", "sourceStatuses"]);
  });

  it("never logs event content in telemetry — only counts and statuses", async () => {
    nativeReadMock.mockResolvedValue({ status: "OK", value: [nativeEventRow], observedAt: "now" });
    googleReadMock.mockResolvedValue({ status: "OK", value: [googleEvent], observedAt: "now" });
    await resolveCanonicalCalendarProjection({ organizationId: "org-1", userId: "user-1", ...RANGE });
    const logged = JSON.stringify(telemetryMock.mock.calls);
    expect(logged).not.toContain("Metrix test");
    expect(logged).not.toContain("Native toplantı");
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
});
