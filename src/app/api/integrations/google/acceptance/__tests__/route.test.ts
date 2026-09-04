import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getGmailStatus: vi.fn(),
  connectorRead: vi.fn(),
}));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({
  requireAuthContextFromCookies: mocks.auth,
  authFail: (error: unknown) => {
    const authError = error as { status?: number; message?: string };
    return Response.json({ ok: false, error: { message: authError.message ?? "Unexpected error." } }, { status: authError.status ?? 500 });
  },
}));
vi.mock("@/lib/integrations/gmail/gmail.service", () => ({ getGmailStatus: mocks.getGmailStatus }));
vi.mock("@/lib/company-intelligence/google-connector-adapter", () => ({
  googleConnectorAdapter: { provider: "GOOGLE", displayName: "Google (Gmail + Calendar)", supportedCapabilities: ["email.recentMessages", "calendar.upcomingEvents"], read: mocks.connectorRead },
}));

import { GET } from "../route";
import { googleConnectorAdapter } from "@/lib/company-intelligence/google-connector-adapter";
import { AuthError } from "@/lib/auth/shared/auth.errors";

const AUTH_CONTEXT = { organization: { id: "org-1" }, user: { id: "user-1" }, membership: { role: "OWNER" } };
const now = "2026-09-04T18:00:00.000Z";

async function callRoute() {
  return GET(new Request("http://localhost/api/integrations/google/acceptance"));
}

describe("GET /api/integrations/google/acceptance", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.getGmailStatus.mockReset();
    mocks.connectorRead.mockReset();
  });

  it("rejects an unauthenticated request", async () => {
    mocks.auth.mockRejectedValue(new AuthError("Unauthorized", 401));
    const response = await callRoute();
    expect(response.status).toBe(401);
    expect(mocks.connectorRead).not.toHaveBeenCalled();
  });

  it("scopes both reads to exactly the authenticated user's own organization and id — never a different org/user", async () => {
    mocks.auth.mockResolvedValue({ organization: { id: "org-42" }, user: { id: "user-77" }, membership: { role: "OWNER" } });
    mocks.getGmailStatus.mockResolvedValue({ connected: true, providerEmail: "owner@gmail.com", readOnly: true, status: "CONNECTED", connectedAt: now, lastSuccessfulAccessAt: now, lastErrorCode: null });
    mocks.connectorRead.mockResolvedValue({ status: "OK", value: [], observedAt: now });
    await callRoute();
    for (const call of mocks.connectorRead.mock.calls) {
      expect(call[0].organizationId).toBe("org-42");
      expect(call[0].params).toEqual({ userId: "user-77" });
    }
  });

  it("returns an explicit safe response when not connected — never attempts a read", async () => {
    mocks.auth.mockResolvedValue(AUTH_CONTEXT);
    mocks.getGmailStatus.mockResolvedValue({ connected: false, providerEmail: null, readOnly: true, status: "NOT_CONNECTED", connectedAt: null, lastSuccessfulAccessAt: null, lastErrorCode: null });
    const response = await callRoute();
    const body = await response.json();
    expect(body.data).toMatchObject({ connected: false, gmailRead: "fail", calendarRead: "fail", errors: ["NOT_CONNECTED"] });
    expect(mocks.connectorRead).not.toHaveBeenCalled();
  });

  it("Gmail success / Calendar success", async () => {
    mocks.auth.mockResolvedValue(AUTH_CONTEXT);
    mocks.getGmailStatus.mockResolvedValue({ connected: true, providerEmail: "owner@gmail.com", readOnly: true, status: "CONNECTED", connectedAt: now, lastSuccessfulAccessAt: now, lastErrorCode: null });
    mocks.connectorRead.mockImplementation(async (request: { factScope: string }) => {
      if (request.factScope === "email.recentMessages") return { status: "OK", value: [{ provider: "gmail", messageId: "m1", receivedAt: "2026-09-04T17:00:00.000Z" }], observedAt: now };
      return { status: "OK", value: [{ provider: "google-calendar", eventId: "e1", startAt: "2026-09-05T09:00:00.000Z" }], observedAt: now };
    });
    const response = await callRoute();
    const body = await response.json();
    expect(body.data).toMatchObject({ connected: true, gmailRead: "success", gmailItemCount: 1, gmailLatestReceivedAt: "2026-09-04T17:00:00.000Z", calendarRead: "success", calendarItemCount: 1, calendarNextEventStart: "2026-09-05T09:00:00.000Z", errors: [] });
  });

  it("Gmail fail / Calendar success", async () => {
    mocks.auth.mockResolvedValue(AUTH_CONTEXT);
    mocks.getGmailStatus.mockResolvedValue({ connected: true, providerEmail: "owner@gmail.com", readOnly: true, status: "CONNECTED", connectedAt: now, lastSuccessfulAccessAt: now, lastErrorCode: null });
    mocks.connectorRead.mockImplementation(async (request: { factScope: string }) => {
      if (request.factScope === "email.recentMessages") return { status: "UNAVAILABLE", observedAt: now, errorMessage: "RECONNECT_REQUIRED" };
      return { status: "OK", value: [{ provider: "google-calendar", eventId: "e1", startAt: now }], observedAt: now };
    });
    const response = await callRoute();
    const body = await response.json();
    expect(body.data).toMatchObject({ gmailRead: "fail", gmailItemCount: 0, calendarRead: "success", calendarItemCount: 1 });
    expect(body.data.errors).toContain("GMAIL_RECONNECT_REQUIRED");
  });

  it("Gmail success / Calendar fail", async () => {
    mocks.auth.mockResolvedValue(AUTH_CONTEXT);
    mocks.getGmailStatus.mockResolvedValue({ connected: true, providerEmail: "owner@gmail.com", readOnly: true, status: "CONNECTED", connectedAt: now, lastSuccessfulAccessAt: now, lastErrorCode: null });
    mocks.connectorRead.mockImplementation(async (request: { factScope: string }) => {
      if (request.factScope === "calendar.upcomingEvents") return { status: "UNAVAILABLE", observedAt: now, errorMessage: "UNAVAILABLE" };
      return { status: "OK", value: [{ provider: "gmail", messageId: "m1", receivedAt: now }], observedAt: now };
    });
    const response = await callRoute();
    const body = await response.json();
    expect(body.data).toMatchObject({ gmailRead: "success", gmailItemCount: 1, calendarRead: "fail", calendarItemCount: 0 });
    expect(body.data.errors).toContain("CALENDAR_UNAVAILABLE");
  });

  it("never exposes a write capability on the connector it uses", () => {
    expect((googleConnectorAdapter as { write?: unknown }).write).toBeUndefined();
  });

  it("never returns message/event content — only safe counts, timestamps, and status", async () => {
    mocks.auth.mockResolvedValue(AUTH_CONTEXT);
    mocks.getGmailStatus.mockResolvedValue({ connected: true, providerEmail: "owner@gmail.com", readOnly: true, status: "CONNECTED", connectedAt: now, lastSuccessfulAccessAt: now, lastErrorCode: null });
    mocks.connectorRead.mockImplementation(async (request: { factScope: string }) => {
      if (request.factScope === "email.recentMessages") return { status: "OK", value: [{ provider: "gmail", messageId: "m1", threadId: "t1", subject: "Gizli konu", body: "Gizli içerik", sender: "a@b.com", receivedAt: now }], observedAt: now };
      return { status: "OK", value: [{ provider: "google-calendar", eventId: "e1", title: "Gizli başlık", description: "Gizli açıklama", attendees: ["a@b.com"], startAt: now }], observedAt: now };
    });
    const response = await callRoute();
    const body = await response.json();
    const keys = Object.keys(body.data);
    expect(keys).toEqual(["connected", "gmailRead", "gmailItemCount", "gmailLatestReceivedAt", "calendarRead", "calendarItemCount", "calendarNextEventStart", "providerEmail", "lastSuccessfulAccessAt", "errors"]);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("Gizli");
    expect(serialized).not.toContain("subject");
    expect(serialized).not.toContain("attendees");
    expect(serialized).not.toContain("token");
  });
});
