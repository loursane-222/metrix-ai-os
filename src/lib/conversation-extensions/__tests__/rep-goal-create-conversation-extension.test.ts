import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ submitRepGoalReport: vi.fn() }));
vi.mock("@/lib/rep-goals/rep-goals-client", () => ({ submitRepGoalReport: mocks.submitRepGoalReport }));

const { repGoalCreateConversationExtension } = await import("../rep-goal-create-conversation-extension");

beforeEach(() => { vi.clearAllMocks(); });

describe("rep-goal-create-conversation-extension", () => {
  it("does not handle an utterance with no goal-setting keyword", async () => {
    const result = await repGoalCreateConversationExtension.execute("bu haftaki saha raporu göster");
    expect(result.status).toBe("NOT_HANDLED");
    expect(mocks.submitRepGoalReport).not.toHaveBeenCalled();
  });

  it("sets goals and reports EXECUTED with the labeled target types", async () => {
    mocks.submitRepGoalReport.mockResolvedValue({
      ok: true,
      data: { report: { status: "SET", repFullName: "Ahmet Yılmaz", visitTargetSet: true, salesTargetSet: true, collectionTargetSet: false } },
    });

    const result = await repGoalCreateConversationExtension.execute("Ahmet için aylık 20 ziyaret ve 500.000 TL satış hedefi koy.");

    expect(mocks.submitRepGoalReport).toHaveBeenCalledWith("Ahmet için aylık 20 ziyaret ve 500.000 TL satış hedefi koy.");
    expect(result.handoff).toMatchObject({ outcomeCode: "REP_GOAL_SET", resultStatus: "EXECUTED", mutationPerformed: true });
    expect(result.handoff?.candidateNames[0]).toContain("Ahmet Yılmaz");
    expect(result.handoff?.candidateNames[0]).toContain("ziyaret, satış");
  });

  it("falls through as NOT_HANDLED when the parser found nothing to set", async () => {
    mocks.submitRepGoalReport.mockResolvedValue({ ok: true, data: { report: { status: "PARSE_FAILED" } } });
    const result = await repGoalCreateConversationExtension.execute("hedeflerimiz hakkında ne düşünüyorsun?");
    expect(result).toEqual({ status: "NOT_HANDLED", handoff: null });
  });

  it("reports a FAILED-shaped handoff when a plain EMPLOYEE is denied", async () => {
    mocks.submitRepGoalReport.mockResolvedValue({ ok: true, data: { report: { status: "DENIED" } } });
    const result = await repGoalCreateConversationExtension.execute("Ahmet için 20 ziyaret hedefi koy");
    expect(result.handoff).toMatchObject({ outcomeCode: "REP_GOAL_DENIED", resultStatus: "FAILED" });
  });

  it("asks for clarification when the rep name can't be resolved", async () => {
    mocks.submitRepGoalReport.mockResolvedValue({ ok: true, data: { report: { status: "REP_NOT_FOUND" } } });
    const result = await repGoalCreateConversationExtension.execute("Bilinmeyen Kişi için 20 ziyaret hedefi koy");
    expect(result.handoff).toMatchObject({ outcomeCode: "REP_GOAL_REP_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" });
  });

  it("asks for clarification with candidate names when the rep name is ambiguous", async () => {
    mocks.submitRepGoalReport.mockResolvedValue({ ok: true, data: { report: { status: "REP_AMBIGUOUS", options: ["Ahmet Yılmaz", "Ahmet Kara"] } } });
    const result = await repGoalCreateConversationExtension.execute("Ahmet için 20 ziyaret hedefi koy");
    expect(result.handoff).toMatchObject({ outcomeCode: "REP_GOAL_REP_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", candidateNames: ["Ahmet Yılmaz", "Ahmet Kara"] });
  });

  it("reports FAILED when the request itself fails", async () => {
    mocks.submitRepGoalReport.mockResolvedValue({ ok: false, error: "Baglanti kurulamadi." });
    const result = await repGoalCreateConversationExtension.execute("Ahmet için 20 ziyaret hedefi koy");
    expect(result.handoff).toMatchObject({ outcomeCode: "REP_GOAL_REPORT_FAILED", resultStatus: "FAILED" });
  });
});
