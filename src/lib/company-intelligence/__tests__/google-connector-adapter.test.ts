import { beforeEach, describe, expect, it, vi } from "vitest";

const { listRecentGmailMessagesMock, listUpcomingCalendarEventsMock, gmailConnectionCountMock } = vi.hoisted(() => ({
  listRecentGmailMessagesMock: vi.fn(),
  listUpcomingCalendarEventsMock: vi.fn(),
  gmailConnectionCountMock: vi.fn(),
}));

vi.mock("@/lib/integrations/gmail/gmail.service", () => ({ listRecentGmailMessages: listRecentGmailMessagesMock }));
vi.mock("@/lib/integrations/google-calendar/google-calendar.service", () => ({ listUpcomingCalendarEvents: listUpcomingCalendarEventsMock }));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { gmailConnection: { count: gmailConnectionCountMock } } }));

import { googleConnectorAdapter } from "../google-connector-adapter";

describe("googleConnectorAdapter", () => {
  beforeEach(() => {
    listRecentGmailMessagesMock.mockReset();
    listUpcomingCalendarEventsMock.mockReset();
    gmailConnectionCountMock.mockReset();
  });

  it("declares provider GOOGLE and both Gmail + Calendar fact scopes", () => {
    expect(googleConnectorAdapter.provider).toBe("GOOGLE");
    expect(googleConnectorAdapter.supportedCapabilities).toEqual(["email.recentMessages", "calendar.upcomingEvents"]);
  });

  it("declares no write method at all — write-routing.ts can never dispatch a Google write through this adapter", () => {
    expect((googleConnectorAdapter as { write?: unknown }).write).toBeUndefined();
  });

  it("is HEALTHY when the organization has at least one CONNECTED Google account", async () => {
    gmailConnectionCountMock.mockResolvedValue(2);
    const health = await googleConnectorAdapter.health("org-1");
    expect(health.status).toBe("HEALTHY");
    expect(gmailConnectionCountMock).toHaveBeenCalledWith({ where: { organizationId: "org-1", status: "CONNECTED" } });
  });

  it("is UNAVAILABLE when the organization has no connected Google account", async () => {
    gmailConnectionCountMock.mockResolvedValue(0);
    const health = await googleConnectorAdapter.health("org-1");
    expect(health.status).toBe("UNAVAILABLE");
  });

  it("routes email.recentMessages to the Gmail read service, scoped to the exact organization and user given", async () => {
    listRecentGmailMessagesMock.mockResolvedValue({ requested: true, status: "OK", retrievedAt: "now", messages: [{ provider: "gmail", messageId: "m1" }] });
    const result = await googleConnectorAdapter.read({ organizationId: "org-1", factScope: "email.recentMessages", params: { userId: "user-1" } });
    expect(listRecentGmailMessagesMock).toHaveBeenCalledWith({ organizationId: "org-1", userId: "user-1", query: undefined });
    expect(result).toMatchObject({ status: "OK", value: [{ provider: "gmail", messageId: "m1" }] });
  });

  it("routes calendar.upcomingEvents to the Calendar read service, scoped to the exact organization and user given", async () => {
    listUpcomingCalendarEventsMock.mockResolvedValue({ status: "OK", retrievedAt: "now", events: [{ provider: "google-calendar", eventId: "e1" }] });
    const result = await googleConnectorAdapter.read({ organizationId: "org-2", factScope: "calendar.upcomingEvents", params: { userId: "user-9" } });
    expect(listUpcomingCalendarEventsMock).toHaveBeenCalledWith({ organizationId: "org-2", userId: "user-9" });
    expect(result).toMatchObject({ status: "OK", value: [{ provider: "google-calendar", eventId: "e1" }] });
  });

  it("never bleeds one organization's request into another — a different org's read never receives the first org's userId", async () => {
    listRecentGmailMessagesMock.mockResolvedValue({ requested: true, status: "NOT_CONNECTED", retrievedAt: "now", messages: [] });
    await googleConnectorAdapter.read({ organizationId: "org-a", factScope: "email.recentMessages", params: { userId: "user-a" } });
    listRecentGmailMessagesMock.mockResolvedValue({ requested: true, status: "NOT_CONNECTED", retrievedAt: "now", messages: [] });
    await googleConnectorAdapter.read({ organizationId: "org-b", factScope: "email.recentMessages", params: { userId: "user-b" } });
    expect(listRecentGmailMessagesMock).toHaveBeenNthCalledWith(1, { organizationId: "org-a", userId: "user-a", query: undefined });
    expect(listRecentGmailMessagesMock).toHaveBeenNthCalledWith(2, { organizationId: "org-b", userId: "user-b", query: undefined });
  });

  it("is UNSUPPORTED when no userId is provided — never guesses which user's Google account to read", async () => {
    const result = await googleConnectorAdapter.read({ organizationId: "org-1", factScope: "email.recentMessages" });
    expect(result.status).toBe("UNSUPPORTED");
    expect(listRecentGmailMessagesMock).not.toHaveBeenCalled();
  });

  it("is UNSUPPORTED for an unknown fact scope", async () => {
    const result = await googleConnectorAdapter.read({ organizationId: "org-1", factScope: "customer.accountingBalance", params: { userId: "user-1" } });
    expect(result.status).toBe("UNSUPPORTED");
  });

  it("surfaces RECONNECT_REQUIRED as a real failure, never as a silent empty success", async () => {
    listRecentGmailMessagesMock.mockResolvedValue({ requested: true, status: "RECONNECT_REQUIRED", retrievedAt: "now", messages: [] });
    const result = await googleConnectorAdapter.read({ organizationId: "org-1", factScope: "email.recentMessages", params: { userId: "user-1" } });
    expect(result.status).toBe("UNAVAILABLE");
  });
});
