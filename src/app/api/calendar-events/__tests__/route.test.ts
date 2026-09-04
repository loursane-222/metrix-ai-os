import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveCanonicalCalendarProjection: vi.fn(),
}));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({
  requireAuthContextFromCookies: mocks.auth,
  authFail: (error: unknown) => {
    const authError = error as { status?: number; message?: string };
    return Response.json({ ok: false, error: { message: authError.message ?? "Unexpected error." } }, { status: authError.status ?? 500 });
  },
}));
vi.mock("@/lib/company-intelligence/calendar-projection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/company-intelligence/calendar-projection")>();
  return { ...actual, resolveCanonicalCalendarProjection: mocks.resolveCanonicalCalendarProjection };
});
// route.ts's POST handler (untouched by this operation) transitively pulls
// in the real Prisma client via calendar-event.service.ts / canonical-operation
// — stubbed here since these GET-only tests never exercise POST.
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

import { GET } from "../route";

const AUTH_CONTEXT = { organization: { id: "org-1" }, user: { id: "user-1" }, membership: { role: "OWNER" } };

async function callRoute(rangeStart = "2026-09-04T00:00:00.000Z", rangeEnd = "2026-09-05T00:00:00.000Z") {
  return GET(new Request(`http://localhost/api/calendar-events?rangeStart=${rangeStart}&rangeEnd=${rangeEnd}`));
}

describe("GET /api/calendar-events — unified calendar truth (Workspace)", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.resolveCanonicalCalendarProjection.mockReset();
  });

  it("B) a Google-sourced event from the canonical projection appears in the Workspace response, native-compatible shape", async () => {
    mocks.auth.mockResolvedValue(AUTH_CONTEXT);
    mocks.resolveCanonicalCalendarProjection.mockResolvedValue({
      nativeEvents: [],
      googleEvents: [{ canonicalEventId: "google:evt-1", provider: "GOOGLE", sourceEventId: "evt-1", title: "Metrix test", description: null, startAt: "2026-09-04T18:30:00.000Z", endAt: "2026-09-04T19:30:00.000Z", allDay: false, attendees: [], status: "CONFIRMED", htmlLink: null }],
      icloudEvents: [],
      sourceStatuses: { METRIX_NATIVE: "OK", GOOGLE: "OK", ICLOUD: "OK" },
    });
    const response = await callRoute();
    const body = await response.json();
    expect(body.data.events).toHaveLength(1);
    expect(body.data.events[0]).toMatchObject({ id: "google:evt-1", title: "Metrix test", provider: "GOOGLE", occurrenceStartAt: "2026-09-04T18:30:00.000Z" });
  });

  it("I) an iCloud-sourced event from the canonical projection appears in the Workspace response — same projection, same route, no separate iCloud path", async () => {
    mocks.auth.mockResolvedValue(AUTH_CONTEXT);
    mocks.resolveCanonicalCalendarProjection.mockResolvedValue({
      nativeEvents: [],
      googleEvents: [],
      icloudEvents: [{ canonicalEventId: "icloud:evt-9", provider: "ICLOUD", sourceEventId: "evt-9", title: "METRIX ICLOUD TEST", description: null, startAt: "2026-09-04T21:30:00.000Z", endAt: "2026-09-04T22:30:00.000Z", allDay: false, attendees: [], status: "CONFIRMED", htmlLink: null }],
      sourceStatuses: { METRIX_NATIVE: "OK", GOOGLE: "OK", ICLOUD: "OK" },
    });
    const response = await callRoute();
    const body = await response.json();
    expect(body.data.events).toHaveLength(1);
    expect(body.data.events[0]).toMatchObject({ id: "icloud:evt-9", title: "METRIX ICLOUD TEST", provider: "ICLOUD", occurrenceStartAt: "2026-09-04T21:30:00.000Z" });
  });

  it("C) native, Google, and iCloud events are all present in the same response, distinctly attributed", async () => {
    mocks.auth.mockResolvedValue(AUTH_CONTEXT);
    mocks.resolveCanonicalCalendarProjection.mockResolvedValue({
      nativeEvents: [{ id: "native-1", title: "Native toplantı", startAt: "2026-09-04T08:00:00.000Z", endAt: "2026-09-04T09:00:00.000Z", allDay: false, status: "PLANNED" }],
      googleEvents: [{ canonicalEventId: "google:evt-1", provider: "GOOGLE", sourceEventId: "evt-1", title: "Metrix test", description: null, startAt: "2026-09-04T18:30:00.000Z", endAt: "2026-09-04T19:30:00.000Z", allDay: false, attendees: [], status: "CONFIRMED", htmlLink: null }],
      icloudEvents: [{ canonicalEventId: "icloud:evt-9", provider: "ICLOUD", sourceEventId: "evt-9", title: "METRIX ICLOUD TEST", description: null, startAt: "2026-09-04T21:30:00.000Z", endAt: "2026-09-04T22:30:00.000Z", allDay: false, attendees: [], status: "CONFIRMED", htmlLink: null }],
      sourceStatuses: { METRIX_NATIVE: "OK", GOOGLE: "OK", ICLOUD: "OK" },
    });
    const response = await callRoute();
    const body = await response.json();
    expect(body.data.events).toHaveLength(3);
    expect(body.data.events.find((event: { provider?: string }) => event.provider === undefined)).toMatchObject({ id: "native-1" });
    expect(body.data.events.find((event: { provider?: string }) => event.provider === "GOOGLE")).toMatchObject({ id: "google:evt-1" });
    expect(body.data.events.find((event: { provider?: string }) => event.provider === "ICLOUD")).toMatchObject({ id: "icloud:evt-9" });
  });

  it("E) exposes sourceStatuses honestly — an unavailable provider never masquerades as an empty-but-complete calendar", async () => {
    mocks.auth.mockResolvedValue(AUTH_CONTEXT);
    mocks.resolveCanonicalCalendarProjection.mockResolvedValue({ nativeEvents: [], googleEvents: [], icloudEvents: [], sourceStatuses: { METRIX_NATIVE: "OK", GOOGLE: "UNAVAILABLE", ICLOUD: "UNAVAILABLE" } });
    const response = await callRoute();
    const body = await response.json();
    expect(body.data.sourceStatuses).toEqual({ METRIX_NATIVE: "OK", GOOGLE: "UNAVAILABLE", ICLOUD: "UNAVAILABLE" });
  });

  it("F) scopes the projection call to exactly the authenticated organization and user", async () => {
    mocks.auth.mockResolvedValue({ organization: { id: "org-42" }, user: { id: "user-77" }, membership: { role: "OWNER" } });
    mocks.resolveCanonicalCalendarProjection.mockResolvedValue({ nativeEvents: [], googleEvents: [], icloudEvents: [], sourceStatuses: { METRIX_NATIVE: "OK", GOOGLE: "OK", ICLOUD: "OK" } });
    await callRoute();
    expect(mocks.resolveCanonicalCalendarProjection).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-42", userId: "user-77" }));
  });

  it("rejects an unauthenticated request", async () => {
    mocks.auth.mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    const response = await callRoute();
    expect(response.status).toBe(401);
    expect(mocks.resolveCanonicalCalendarProjection).not.toHaveBeenCalled();
  });
});
