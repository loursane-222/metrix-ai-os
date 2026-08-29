import { beforeEach, describe, expect, it, vi } from "vitest";

const { parseRepGoalReportMock, listActiveNotificationRecipientRecordsMock, upsertPersonMonthlyGoalMock } = vi.hoisted(() => ({
  parseRepGoalReportMock: vi.fn(),
  listActiveNotificationRecipientRecordsMock: vi.fn(),
  upsertPersonMonthlyGoalMock: vi.fn(),
}));

vi.mock("../rep-goal-report-parser.service", () => ({ parseRepGoalReport: parseRepGoalReportMock }));
vi.mock("@/lib/core/organization-members/organization-member.repository", () => ({
  listActiveNotificationRecipientRecords: listActiveNotificationRecipientRecordsMock,
}));
vi.mock("../rep-goal.repository", () => ({ upsertPersonMonthlyGoal: upsertPersonMonthlyGoalMock }));

import { processRepGoalReport } from "../rep-goal-create-orchestrator.service";

const authContext = (role: string, userId = "user-1", fullName: string | null = "Murat Arda") => ({
  user: { id: userId, fullName },
  organization: { id: "org-1" },
  membership: { role },
} as never);

describe("processRepGoalReport", () => {
  beforeEach(() => {
    parseRepGoalReportMock.mockReset();
    listActiveNotificationRecipientRecordsMock.mockReset().mockResolvedValue([]);
    upsertPersonMonthlyGoalMock.mockReset().mockResolvedValue({});
  });

  it("denies a plain EMPLOYEE from setting any rep's goal, without even parsing", async () => {
    const result = await processRepGoalReport({ authContext: authContext("EMPLOYEE"), message: "Ahmet için 20 ziyaret hedefi koy" });
    expect(result).toEqual({ status: "DENIED" });
    expect(parseRepGoalReportMock).not.toHaveBeenCalled();
  });

  it("returns PARSE_FAILED when nothing could be extracted", async () => {
    parseRepGoalReportMock.mockResolvedValue(null);
    const result = await processRepGoalReport({ authContext: authContext("MANAGER"), message: "belirsiz mesaj" });
    expect(result).toEqual({ status: "PARSE_FAILED" });
  });

  it("resolves 'kendim' to the actor's own userId and sets only the stated targets", async () => {
    parseRepGoalReportMock.mockResolvedValue({ repNameRaw: "kendim", visitTarget: 10, salesTarget: null, collectionTarget: 150000 });
    const result = await processRepGoalReport({ authContext: authContext("MANAGER", "user-1", "Murat Arda"), message: "kendim için 10 ziyaret ve 150.000 TL tahsilat hedefi koy" });

    expect(listActiveNotificationRecipientRecordsMock).not.toHaveBeenCalled();
    expect(upsertPersonMonthlyGoalMock).toHaveBeenCalledTimes(2);
    expect(upsertPersonMonthlyGoalMock).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "user-1", goalType: "ACTIVITY", amount: 10 }));
    expect(upsertPersonMonthlyGoalMock).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "user-1", goalType: "COLLECTION", amount: 150000 }));
    expect(result).toEqual({ status: "SET", repFullName: "Murat Arda", visitTargetSet: true, salesTargetSet: false, collectionTargetSet: true });
  });

  it("resolves a named colleague and sets all three targets when all three are stated", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([{ userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" }]);
    parseRepGoalReportMock.mockResolvedValue({ repNameRaw: "Ahmet", visitTarget: 20, salesTarget: 500000, collectionTarget: 300000 });

    const result = await processRepGoalReport({ authContext: authContext("MANAGER"), message: "Ahmet için aylık 20 ziyaret, 500.000 TL satış ve 300.000 TL tahsilat hedefi koy." });

    expect(upsertPersonMonthlyGoalMock).toHaveBeenCalledTimes(3);
    expect(upsertPersonMonthlyGoalMock).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "user-2", goalType: "SALES", amount: 500000 }));
    expect(result).toEqual({ status: "SET", repFullName: "Ahmet Yılmaz", visitTargetSet: true, salesTargetSet: true, collectionTargetSet: true });
  });

  it("returns REP_NOT_FOUND without creating any goal when the name doesn't match", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([{ userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" }]);
    parseRepGoalReportMock.mockResolvedValue({ repNameRaw: "Bilinmeyen Kişi", visitTarget: 10, salesTarget: null, collectionTarget: null });

    const result = await processRepGoalReport({ authContext: authContext("MANAGER"), message: "Bilinmeyen Kişi için 10 ziyaret hedefi koy" });

    expect(result).toEqual({ status: "REP_NOT_FOUND" });
    expect(upsertPersonMonthlyGoalMock).not.toHaveBeenCalled();
  });

  it("returns REP_AMBIGUOUS when multiple members share the same partial name", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([
      { userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" },
      { userId: "user-3", fullName: "Ahmet Kara", role: "EMPLOYEE" },
    ]);
    parseRepGoalReportMock.mockResolvedValue({ repNameRaw: "Ahmet", visitTarget: 10, salesTarget: null, collectionTarget: null });

    const result = await processRepGoalReport({ authContext: authContext("MANAGER"), message: "Ahmet için 10 ziyaret hedefi koy" });

    expect(result).toEqual({ status: "REP_AMBIGUOUS", options: ["Ahmet Yılmaz", "Ahmet Kara"] });
    expect(upsertPersonMonthlyGoalMock).not.toHaveBeenCalled();
  });

  it("allows a TEAM_LEAD and an OWNER, not just MANAGER", async () => {
    parseRepGoalReportMock.mockResolvedValue({ repNameRaw: "kendim", visitTarget: 5, salesTarget: null, collectionTarget: null });
    const teamLead = await processRepGoalReport({ authContext: authContext("TEAM_LEAD"), message: "x" });
    const owner = await processRepGoalReport({ authContext: authContext("OWNER"), message: "x" });
    expect(teamLead.status).toBe("SET");
    expect(owner.status).toBe("SET");
  });
});
