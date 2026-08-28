import { beforeEach, describe, expect, it, vi } from "vitest";

const { listSalesGoalsMock, buildExecutiveGoalIntelligenceMock, analyzeGoalAchievementMock } = vi.hoisted(() => ({
  listSalesGoalsMock: vi.fn(),
  buildExecutiveGoalIntelligenceMock: vi.fn(),
  analyzeGoalAchievementMock: vi.fn(),
}));

vi.mock("@/lib/core/goals/goal.service", () => ({ listSalesGoals: listSalesGoalsMock }));
vi.mock("@/lib/executive-goal-intelligence", () => ({ buildExecutiveGoalIntelligence: buildExecutiveGoalIntelligenceMock }));
vi.mock("@/lib/executive-forecasting/goal-achievement-analyzer.service", () => ({ analyzeGoalAchievement: analyzeGoalAchievementMock }));

import { resolveCompanyMonthlyGoalStatus } from "../field-visit-company-goal-status.service";

describe("resolveCompanyMonthlyGoalStatus", () => {
  beforeEach(() => {
    listSalesGoalsMock.mockReset();
    buildExecutiveGoalIntelligenceMock.mockReset();
    analyzeGoalAchievementMock.mockReset();
  });

  it("returns null when the organization has no active monthly sales goal", async () => {
    listSalesGoalsMock.mockResolvedValue([]);
    const result = await resolveCompanyMonthlyGoalStatus("org-1");
    expect(result).toBeNull();
    expect(buildExecutiveGoalIntelligenceMock).not.toHaveBeenCalled();
  });

  it("returns null when goal intelligence has no monthly revenue target", async () => {
    listSalesGoalsMock.mockResolvedValue([{ id: "g1" }]);
    buildExecutiveGoalIntelligenceMock.mockReturnValue({ monthlyRevenueTarget: null });
    const result = await resolveCompanyMonthlyGoalStatus("org-1");
    expect(result).toBeNull();
    expect(analyzeGoalAchievementMock).not.toHaveBeenCalled();
  });

  it("reuses the live goal-achievement engine, passing null projection", async () => {
    listSalesGoalsMock.mockResolvedValue([{ id: "g1" }]);
    buildExecutiveGoalIntelligenceMock.mockReturnValue({ monthlyRevenueTarget: 500000 });
    analyzeGoalAchievementMock.mockResolvedValue({
      signal: null,
      projectionFields: { monthlyTarget: 500000, monthToDateRevenue: 120000, forecastedMonthEndRevenue: 300000, goalAchievementRate: 0.6, monthToDateCashCollection: 90000 },
    });

    const result = await resolveCompanyMonthlyGoalStatus("org-1");

    expect(analyzeGoalAchievementMock).toHaveBeenCalledWith("org-1", { monthlyRevenueTarget: 500000 }, null);
    expect(result).toEqual({ monthlyTarget: 500000, monthToDateRevenue: 120000, forecastedMonthEndRevenue: 300000, goalAchievementRate: 0.6, monthToDateCashCollection: 90000 });
  });

  it("defaults missing optional projection fields to 0 rather than leaving them undefined", async () => {
    listSalesGoalsMock.mockResolvedValue([{ id: "g1" }]);
    buildExecutiveGoalIntelligenceMock.mockReturnValue({ monthlyRevenueTarget: 500000 });
    analyzeGoalAchievementMock.mockResolvedValue({ signal: null, projectionFields: { monthlyTarget: 500000, goalAchievementRate: 0 } });

    const result = await resolveCompanyMonthlyGoalStatus("org-1");

    expect(result).toEqual({ monthlyTarget: 500000, monthToDateRevenue: 0, forecastedMonthEndRevenue: 0, goalAchievementRate: 0, monthToDateCashCollection: 0 });
  });

  it("queries only ACTIVE MONTHLY goals", async () => {
    listSalesGoalsMock.mockResolvedValue([]);
    await resolveCompanyMonthlyGoalStatus("org-1");
    expect(listSalesGoalsMock).toHaveBeenCalledWith({ organizationId: "org-1", period: "MONTHLY", status: "ACTIVE" });
  });
});
