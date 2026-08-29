import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ notification: { findMany: vi.fn() } }));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: db }));

const { listDistinctPersonGoalOwnersMock, buildRepMorningBriefingMock, notifyMock, listOrganizationIdsMock } = vi.hoisted(() => ({
  listDistinctPersonGoalOwnersMock: vi.fn(),
  buildRepMorningBriefingMock: vi.fn(),
  notifyMock: vi.fn(),
  listOrganizationIdsMock: vi.fn(),
}));

vi.mock("../rep-goal.repository", () => ({ listDistinctPersonGoalOwners: listDistinctPersonGoalOwnersMock }));
vi.mock("../rep-morning-briefing.service", () => ({ buildRepMorningBriefing: buildRepMorningBriefingMock }));
vi.mock("@/lib/core/notifications/notification.service", () => ({ notify: notifyMock }));
vi.mock("@/lib/core/organizations/organization.repository", () => ({ listOrganizationIds: listOrganizationIdsMock }));

import { runRepMorningBriefing, runRepMorningBriefingForOrganization } from "../rep-morning-briefing-runner.service";

const briefing = {
  goalStatus: { visitTarget: 10, visitActual: 2, salesTarget: 500000, salesActual: 100000, collectionTarget: null, collectionActual: 0 },
  noteSuggestion: "Arde Yapı'nın teşhir talebini bugün takip et.",
};

describe("runRepMorningBriefingForOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.notification.findMany.mockResolvedValue([]);
  });

  it("sends nothing and reports zero when no rep has an active goal", async () => {
    listDistinctPersonGoalOwnersMock.mockResolvedValue([]);
    const result = await runRepMorningBriefingForOrganization("org-1");
    expect(result).toEqual({ organizationId: "org-1", briefingsSent: 0, skipped: false });
    expect(buildRepMorningBriefingMock).not.toHaveBeenCalled();
  });

  it("notifies each rep with a briefing, combining the goal line and note suggestion", async () => {
    listDistinctPersonGoalOwnersMock.mockResolvedValue(["user-2"]);
    buildRepMorningBriefingMock.mockResolvedValue(briefing);

    const result = await runRepMorningBriefingForOrganization("org-1");

    expect(result).toEqual({ organizationId: "org-1", briefingsSent: 1, skipped: false });
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      recipientUserId: "user-2",
      type: "rep_morning_briefing.delivered",
      entityType: "RepMorningBriefing",
      entityId: "user-2",
      body: expect.stringContaining("2/10 ziyaret"),
    }));
    expect(notifyMock.mock.calls[0]![0].body).toContain("teşhir talebini");
  });

  it("skips a rep whose own briefing resolves to null without notifying them", async () => {
    listDistinctPersonGoalOwnersMock.mockResolvedValue(["user-2"]);
    buildRepMorningBriefingMock.mockResolvedValue(null);
    const result = await runRepMorningBriefingForOrganization("org-1");
    expect(result).toEqual({ organizationId: "org-1", briefingsSent: 0, skipped: false });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("never re-notifies a rep already notified within the dedup window", async () => {
    listDistinctPersonGoalOwnersMock.mockResolvedValue(["user-2"]);
    buildRepMorningBriefingMock.mockResolvedValue(briefing);
    db.notification.findMany.mockResolvedValue([{ entityId: "user-2" }]);

    const result = await runRepMorningBriefingForOrganization("org-1");

    expect(result).toEqual({ organizationId: "org-1", briefingsSent: 0, skipped: false });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(buildRepMorningBriefingMock).not.toHaveBeenCalled();
  });

  it("notifies multiple reps independently", async () => {
    listDistinctPersonGoalOwnersMock.mockResolvedValue(["user-2", "user-3"]);
    buildRepMorningBriefingMock.mockResolvedValue(briefing);
    const result = await runRepMorningBriefingForOrganization("org-1");
    expect(result.briefingsSent).toBe(2);
    expect(notifyMock).toHaveBeenCalledTimes(2);
  });
});

describe("runRepMorningBriefing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.notification.findMany.mockResolvedValue([]);
  });

  it("processes every organization independently and aggregates totals", async () => {
    listOrganizationIdsMock.mockResolvedValue(["org-1", "org-2"]);
    listDistinctPersonGoalOwnersMock
      .mockResolvedValueOnce(["user-2"])
      .mockResolvedValueOnce([]);
    buildRepMorningBriefingMock.mockResolvedValue(briefing);

    const result = await runRepMorningBriefing();

    expect(result.processed).toBe(2);
    expect(result.totalBriefingsSent).toBe(1);
  });

  it("does not let one organization's failure stop the batch", async () => {
    listOrganizationIdsMock.mockResolvedValue(["org-1", "org-2"]);
    listDistinctPersonGoalOwnersMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([]);

    const result = await runRepMorningBriefing();

    expect(result.processed).toBe(2);
    expect(result.results[0]).toEqual({ organizationId: "org-1", briefingsSent: 0, skipped: true });
  });
});
