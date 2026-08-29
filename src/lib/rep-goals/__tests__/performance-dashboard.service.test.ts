import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listActiveNotificationRecipientRecordsMock,
  resolveCompanyMonthlyGoalStatusMock,
  resolveRepGoalAchievementMock,
  resolveTeamGoalAchievementMock,
  listDistinctPersonGoalOwnersMock,
} = vi.hoisted(() => ({
  listActiveNotificationRecipientRecordsMock: vi.fn(),
  resolveCompanyMonthlyGoalStatusMock: vi.fn(),
  resolveRepGoalAchievementMock: vi.fn(),
  resolveTeamGoalAchievementMock: vi.fn(),
  listDistinctPersonGoalOwnersMock: vi.fn(),
}));

vi.mock("@/lib/core/organization-members/organization-member.repository", () => ({
  listActiveNotificationRecipientRecords: listActiveNotificationRecipientRecordsMock,
}));
vi.mock("@/lib/field-visits/field-visit-company-goal-status.service", () => ({
  resolveCompanyMonthlyGoalStatus: resolveCompanyMonthlyGoalStatusMock,
}));
vi.mock("../rep-goal-achievement.service", () => ({
  resolveRepGoalAchievement: resolveRepGoalAchievementMock,
  resolveTeamGoalAchievement: resolveTeamGoalAchievementMock,
}));
vi.mock("../rep-goal.repository", () => ({ listDistinctPersonGoalOwners: listDistinctPersonGoalOwnersMock }));

import { resolvePerformanceDashboard } from "../performance-dashboard.service";

const authContext = (role: string, userId = "user-1") => ({
  user: { id: userId },
  organization: { id: "org-1" },
  membership: { role },
} as never);

const companyGoalStatus = { monthlyTarget: 500000, monthToDateRevenue: 100000, forecastedMonthEndRevenue: 200000, goalAchievementRate: 0.4, monthToDateCashCollection: 50000 };
const repGoalStatus = { visitTarget: 10, visitActual: 3, salesTarget: null, salesActual: 0, collectionTarget: null, collectionActual: 0 };

describe("resolvePerformanceDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCompanyMonthlyGoalStatusMock.mockResolvedValue(companyGoalStatus);
  });

  it("returns a SELF-scoped view with only the actor's own goal status for a plain EMPLOYEE", async () => {
    resolveRepGoalAchievementMock.mockResolvedValue(repGoalStatus);
    const result = await resolvePerformanceDashboard(authContext("EMPLOYEE", "user-1"));

    expect(result).toEqual({ scope: "SELF", companyGoalStatus, personalGoalStatus: repGoalStatus });
    expect(resolveRepGoalAchievementMock).toHaveBeenCalledWith("org-1", "user-1");
    expect(listDistinctPersonGoalOwnersMock).not.toHaveBeenCalled();
  });

  it("returns a MANAGER-scoped view with team aggregate and a per-rep row list", async () => {
    listDistinctPersonGoalOwnersMock.mockResolvedValue(["user-2", "user-3"]);
    resolveTeamGoalAchievementMock.mockResolvedValue({ repCount: 2, ...repGoalStatus });
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([
      { userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" },
      { userId: "user-3", fullName: "Zeynep Kara", role: "EMPLOYEE" },
    ]);
    resolveRepGoalAchievementMock.mockResolvedValue(repGoalStatus);

    const result = await resolvePerformanceDashboard(authContext("MANAGER"));

    expect(result.scope).toBe("MANAGER");
    if (result.scope === "MANAGER") {
      expect(result.teamGoalStatus).toEqual({ repCount: 2, ...repGoalStatus });
      expect(result.reps).toEqual([
        { userId: "user-2", fullName: "Ahmet Yılmaz", goalStatus: repGoalStatus },
        { userId: "user-3", fullName: "Zeynep Kara", goalStatus: repGoalStatus },
      ]);
    }
  });

  it("excludes a rep row whose own goal achievement resolves to null", async () => {
    listDistinctPersonGoalOwnersMock.mockResolvedValue(["user-2"]);
    resolveTeamGoalAchievementMock.mockResolvedValue(null);
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([{ userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" }]);
    resolveRepGoalAchievementMock.mockResolvedValue(null);

    const result = await resolvePerformanceDashboard(authContext("OWNER"));

    expect(result.scope).toBe("MANAGER");
    if (result.scope === "MANAGER") expect(result.reps).toEqual([]);
  });

  it("falls back to a placeholder name when a rep isn't in the active member list", async () => {
    listDistinctPersonGoalOwnersMock.mockResolvedValue(["user-2"]);
    resolveTeamGoalAchievementMock.mockResolvedValue(null);
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([]);
    resolveRepGoalAchievementMock.mockResolvedValue(repGoalStatus);

    const result = await resolvePerformanceDashboard(authContext("EXECUTIVE"));

    expect(result.scope).toBe("MANAGER");
    if (result.scope === "MANAGER") expect(result.reps[0]?.fullName).toBe("İsimsiz");
  });

  it("allows TEAM_LEAD the manager-scoped view too", async () => {
    listDistinctPersonGoalOwnersMock.mockResolvedValue([]);
    resolveTeamGoalAchievementMock.mockResolvedValue(null);
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([]);

    const result = await resolvePerformanceDashboard(authContext("TEAM_LEAD"));
    expect(result.scope).toBe("MANAGER");
  });
});
