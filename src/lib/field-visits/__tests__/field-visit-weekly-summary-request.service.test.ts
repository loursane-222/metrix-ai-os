import { beforeEach, describe, expect, it, vi } from "vitest";

const { listActiveNotificationRecipientRecordsMock, listFieldVisitsMock, listPaymentsMock, resolveCompanyMonthlyGoalStatusMock, resolveRepGoalAchievementMock } = vi.hoisted(() => ({
  listActiveNotificationRecipientRecordsMock: vi.fn(),
  listFieldVisitsMock: vi.fn(),
  listPaymentsMock: vi.fn(),
  resolveCompanyMonthlyGoalStatusMock: vi.fn(),
  resolveRepGoalAchievementMock: vi.fn(),
}));

vi.mock("@/lib/core/organization-members/organization-member.repository", () => ({
  listActiveNotificationRecipientRecords: listActiveNotificationRecipientRecordsMock,
}));
vi.mock("@/lib/core/field-visits/field-visit.service", () => ({ listFieldVisits: listFieldVisitsMock }));
vi.mock("@/lib/core/payments/payment.service", () => ({ listPayments: listPaymentsMock }));
vi.mock("../field-visit-company-goal-status.service", () => ({ resolveCompanyMonthlyGoalStatus: resolveCompanyMonthlyGoalStatusMock }));
vi.mock("@/lib/rep-goals/rep-goal-achievement.service", () => ({ resolveRepGoalAchievement: resolveRepGoalAchievementMock }));

import { resolveFieldVisitWeeklySummaryRequest } from "../field-visit-weekly-summary-request.service";

const authContext = (role: string, userId = "user-1") => ({
  user: { id: userId },
  organization: { id: "org-1" },
  membership: { role },
} as never);

describe("resolveFieldVisitWeeklySummaryRequest", () => {
  beforeEach(() => {
    listActiveNotificationRecipientRecordsMock.mockReset();
    listFieldVisitsMock.mockReset().mockResolvedValue([]);
    listPaymentsMock.mockReset().mockResolvedValue([]);
    resolveCompanyMonthlyGoalStatusMock.mockReset().mockResolvedValue(null);
    resolveRepGoalAchievementMock.mockReset().mockResolvedValue(null);
  });

  it("resolves the actor's own week when targetReference is null", async () => {
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("EMPLOYEE"), targetReference: null });
    expect(result.status).toBe("ALLOWED");
    if (result.status === "ALLOWED") {
      expect(result.scope).toBe("SELF");
      expect(listFieldVisitsMock).toHaveBeenCalledWith(expect.objectContaining({ repUserId: "user-1" }));
    }
  });

  it("attaches the company monthly goal status alongside the summary", async () => {
    const goalStatus = { monthlyTarget: 500000, monthToDateRevenue: 120000, forecastedMonthEndRevenue: 300000, goalAchievementRate: 0.6, monthToDateCashCollection: 90000 };
    resolveCompanyMonthlyGoalStatusMock.mockResolvedValue(goalStatus);
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("EMPLOYEE"), targetReference: null });
    expect(result.status).toBe("ALLOWED");
    if (result.status === "ALLOWED") {
      expect(result.companyGoalStatus).toEqual(goalStatus);
      expect(resolveCompanyMonthlyGoalStatusMock).toHaveBeenCalledWith("org-1");
    }
  });

  it("returns null companyGoalStatus when the organization has no active monthly target", async () => {
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("EMPLOYEE"), targetReference: null });
    expect(result.status).toBe("ALLOWED");
    if (result.status === "ALLOWED") expect(result.companyGoalStatus).toBeNull();
  });

  it("never resolves company goal status when access is DENIED", async () => {
    await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("EMPLOYEE"), targetReference: "ekip" });
    expect(resolveCompanyMonthlyGoalStatusMock).not.toHaveBeenCalled();
  });

  it("attaches the actor's own personal goal status for SELF scope", async () => {
    const goalStatus = { visitTarget: 20, visitActual: 5, salesTarget: null, salesActual: 0, collectionTarget: null, collectionActual: 0 };
    resolveRepGoalAchievementMock.mockResolvedValue(goalStatus);
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("EMPLOYEE", "user-1"), targetReference: null });
    expect(result.status).toBe("ALLOWED");
    if (result.status === "ALLOWED") {
      expect(result.personalGoalStatus).toEqual(goalStatus);
      expect(resolveRepGoalAchievementMock).toHaveBeenCalledWith("org-1", "user-1");
    }
  });

  it("attaches the resolved colleague's personal goal status for COLLEAGUE scope", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([{ userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" }]);
    const goalStatus = { visitTarget: 10, visitActual: 2, salesTarget: null, salesActual: 0, collectionTarget: null, collectionActual: 0 };
    resolveRepGoalAchievementMock.mockResolvedValue(goalStatus);

    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("MANAGER"), targetReference: "Ahmet" });

    expect(result.status).toBe("ALLOWED");
    if (result.status === "ALLOWED") {
      expect(result.personalGoalStatus).toEqual(goalStatus);
      expect(resolveRepGoalAchievementMock).toHaveBeenCalledWith("org-1", "user-2");
    }
  });

  it("does not resolve any single rep's personal goal status for TEAM scope", async () => {
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("MANAGER"), targetReference: "ekip" });
    expect(result.status).toBe("ALLOWED");
    if (result.status === "ALLOWED") expect(result.personalGoalStatus).toBeNull();
    expect(resolveRepGoalAchievementMock).not.toHaveBeenCalled();
  });

  it("resolves the actor's own week for a self-referencing phrase", async () => {
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("EMPLOYEE"), targetReference: "kendi" });
    expect(result.status).toBe("ALLOWED");
    if (result.status === "ALLOWED") expect(result.scope).toBe("SELF");
  });

  it("denies a plain EMPLOYEE asking for the team", async () => {
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("EMPLOYEE"), targetReference: "ekip" });
    expect(result).toEqual({ status: "DENIED" });
    expect(listActiveNotificationRecipientRecordsMock).not.toHaveBeenCalled();
  });

  it("allows a MANAGER to see the team", async () => {
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("MANAGER"), targetReference: "takım" });
    expect(result.status).toBe("ALLOWED");
    if (result.status === "ALLOWED") {
      expect(result.scope).toBe("TEAM");
      expect(listFieldVisitsMock).toHaveBeenCalledWith(expect.objectContaining({ repUserId: undefined }));
    }
  });

  it("resolves a named colleague and denies a plain EMPLOYEE from seeing them", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([{ userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" }]);
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("EMPLOYEE"), targetReference: "Ahmet Yılmaz" });
    expect(result).toEqual({ status: "DENIED" });
  });

  it("resolves a named colleague and allows a MANAGER to see them", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([{ userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" }]);
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("MANAGER"), targetReference: "Ahmet" });
    expect(result.status).toBe("ALLOWED");
    if (result.status === "ALLOWED") {
      expect(result.scope).toBe("COLLEAGUE");
      expect(result.repFullName).toBe("Ahmet Yılmaz");
      expect(listFieldVisitsMock).toHaveBeenCalledWith(expect.objectContaining({ repUserId: "user-2" }));
    }
  });

  it("returns NOT_FOUND for a name with no match, without leaking a DENIED for an unresolvable name", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([{ userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" }]);
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("MANAGER"), targetReference: "Bilinmeyen Kişi" });
    expect(result).toEqual({ status: "NOT_FOUND" });
  });

  it("returns AMBIGUOUS when multiple members share the same partial name", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([
      { userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" },
      { userId: "user-3", fullName: "Ahmet Kara", role: "EMPLOYEE" },
    ]);
    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext: authContext("MANAGER"), targetReference: "Ahmet" });
    expect(result.status).toBe("AMBIGUOUS");
    if (result.status === "AMBIGUOUS") expect(result.options).toEqual(["Ahmet Yılmaz", "Ahmet Kara"]);
  });
});
