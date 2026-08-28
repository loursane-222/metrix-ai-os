import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ notification: { findMany: vi.fn() } }));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: db }));

const {
  buildExecutiveOperatingContextMock,
  buildExecutiveAlertsMock,
  listActiveNotificationRecipientRecordsMock,
  notifyMock,
  listOrganizationIdsMock,
} = vi.hoisted(() => ({
  buildExecutiveOperatingContextMock: vi.fn(),
  buildExecutiveAlertsMock: vi.fn(),
  listActiveNotificationRecipientRecordsMock: vi.fn(),
  notifyMock: vi.fn(),
  listOrganizationIdsMock: vi.fn(),
}));

vi.mock("@/lib/executive-operating-context", () => ({
  buildExecutiveOperatingContext: buildExecutiveOperatingContextMock,
}));
vi.mock("@/lib/executive-alerts/executive-alert-engine.service", () => ({
  buildExecutiveAlerts: buildExecutiveAlertsMock,
}));
vi.mock("@/lib/core/organization-members/organization-member.repository", () => ({
  listActiveNotificationRecipientRecords: listActiveNotificationRecipientRecordsMock,
}));
vi.mock("@/lib/core/notifications/notification.service", () => ({
  notify: notifyMock,
}));
vi.mock("@/lib/core/organizations/organization.repository", () => ({
  listOrganizationIds: listOrganizationIdsMock,
}));

import { runExecutiveWatch, runExecutiveWatchForOrganization } from "../executive-autonomous-watch.service";

const criticalAlert = { id: "COLLECTION_PRESSURE_x", severity: "CRITICAL" as const, category: "COLLECTION_PRESSURE" as const, source: "payment_intelligence" as const, headline: "Tahsilat baskısı çok yüksek.", actionableStep: "Müşteriyi ara.", isActionable: true };
const watchAlert = { id: "MARKET_RISK_y", severity: "WATCH" as const, category: "MARKET_RISK" as const, source: "briefing" as const, headline: "Kur riski.", actionableStep: null, isActionable: false };
const owner = { userId: "user-owner", fullName: "Ayşe Owner", role: "OWNER" as const };
const member = { userId: "user-member", fullName: "Ali Member", role: "MEMBER" as const };

describe("runExecutiveWatchForOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildExecutiveOperatingContextMock.mockResolvedValue({ executiveForecast: null, paymentIntelligence: null, collectionActionContext: null });
    db.notification.findMany.mockResolvedValue([]);
  });

  it("sends nothing and reports zero when no alert clears WATCH", async () => {
    buildExecutiveAlertsMock.mockReturnValue({ criticalAlerts: [], highAlerts: [], watchAlerts: [watchAlert], totalCount: 1, hasActionableItems: false });
    const result = await runExecutiveWatchForOrganization("org-1");
    expect(result).toEqual({ organizationId: "org-1", alertsFound: 0, notificationsSent: 0, skipped: false });
    expect(listActiveNotificationRecipientRecordsMock).not.toHaveBeenCalled();
  });

  it("notifies every OWNER/EXECUTIVE recipient for a CRITICAL alert, never a plain MEMBER", async () => {
    buildExecutiveAlertsMock.mockReturnValue({ criticalAlerts: [criticalAlert], highAlerts: [], watchAlerts: [], totalCount: 1, hasActionableItems: true });
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([owner, member]);
    const result = await runExecutiveWatchForOrganization("org-1");
    expect(result).toEqual({ organizationId: "org-1", alertsFound: 1, notificationsSent: 1, skipped: false });
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      recipientUserId: "user-owner",
      type: "executive_alert.raised",
      entityType: "ExecutiveAlert",
      entityId: "COLLECTION_PRESSURE_x",
      severity: "CRITICAL",
    }));
  });

  it("reports skipped when the organization has no OWNER/EXECUTIVE to notify", async () => {
    buildExecutiveAlertsMock.mockReturnValue({ criticalAlerts: [criticalAlert], highAlerts: [], watchAlerts: [], totalCount: 1, hasActionableItems: true });
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([member]);
    const result = await runExecutiveWatchForOrganization("org-1");
    expect(result).toEqual({ organizationId: "org-1", alertsFound: 1, notificationsSent: 0, skipped: true });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("never re-notifies the same alert id within the dedup window", async () => {
    buildExecutiveAlertsMock.mockReturnValue({ criticalAlerts: [criticalAlert], highAlerts: [], watchAlerts: [], totalCount: 1, hasActionableItems: true });
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([owner]);
    db.notification.findMany.mockResolvedValue([{ entityId: "COLLECTION_PRESSURE_x" }]);
    const result = await runExecutiveWatchForOrganization("org-1");
    expect(result).toEqual({ organizationId: "org-1", alertsFound: 1, notificationsSent: 0, skipped: false });
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe("runExecutiveWatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildExecutiveOperatingContextMock.mockResolvedValue({ executiveForecast: null, paymentIntelligence: null, collectionActionContext: null });
    db.notification.findMany.mockResolvedValue([]);
  });

  it("processes every organization independently and aggregates totals", async () => {
    listOrganizationIdsMock.mockResolvedValue(["org-1", "org-2"]);
    buildExecutiveAlertsMock
      .mockReturnValueOnce({ criticalAlerts: [criticalAlert], highAlerts: [], watchAlerts: [], totalCount: 1, hasActionableItems: true })
      .mockReturnValueOnce({ criticalAlerts: [], highAlerts: [], watchAlerts: [], totalCount: 0, hasActionableItems: false });
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([owner]);
    const result = await runExecutiveWatch();
    expect(result.processed).toBe(2);
    expect(result.totalAlertsFound).toBe(1);
    expect(result.totalNotificationsSent).toBe(1);
  });

  it("does not let one organization's failure stop the batch", async () => {
    listOrganizationIdsMock.mockResolvedValue(["org-1", "org-2"]);
    buildExecutiveOperatingContextMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ executiveForecast: null, paymentIntelligence: null, collectionActionContext: null });
    buildExecutiveAlertsMock.mockReturnValue({ criticalAlerts: [], highAlerts: [], watchAlerts: [], totalCount: 0, hasActionableItems: false });
    const result = await runExecutiveWatch();
    expect(result.processed).toBe(2);
    expect(result.results[0]).toEqual({ organizationId: "org-1", alertsFound: 0, notificationsSent: 0, skipped: true });
  });
});
