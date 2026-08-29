import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateConversationExtensionHandoff } from "../conversation-extension-handoff";

const mocks = vi.hoisted(() => ({ submitReportAnswerMessage: vi.fn() }));
vi.mock("@/lib/reports/reports-client", () => ({ submitReportAnswerMessage: mocks.submitReportAnswerMessage }));

const { reportSubmissionConversationExtension } = await import("../report-submission-conversation-extension");

// The server re-validates every handoff through this exact function
// (conversation-extension-handoff.ts) before trusting it — asserting
// against the real validator catches disallowed-character regressions
// that a plain shape check would miss.
function expectValidHandoff(handoff: unknown) {
  expect(validateConversationExtensionHandoff(handoff)).not.toBeNull();
}

beforeEach(() => { vi.clearAllMocks(); });

describe("report-submission-conversation-extension", () => {
  it("does not handle an utterance with no report-filling keyword", async () => {
    const result = await reportSubmissionConversationExtension.execute("bu haftaki saha raporu göster");
    expect(result.status).toBe("NOT_HANDLED");
    expect(mocks.submitReportAnswerMessage).not.toHaveBeenCalled();
  });

  it("reports PARTIAL when only some questions are answered", async () => {
    mocks.submitReportAnswerMessage.mockResolvedValue({
      ok: true,
      data: { report: { status: "PARTIAL", templateName: "Haftalık Yönetim Raporu", answeredNow: ["important_development"], remainingQuestions: ["Müşteri riski"] } },
    });

    const result = await reportSubmissionConversationExtension.execute("Bu hafta Arde Yapı ile anlaşma imzaladık, raporumu doldur.");

    expect(mocks.submitReportAnswerMessage).toHaveBeenCalledWith("Bu hafta Arde Yapı ile anlaşma imzaladık, raporumu doldur.");
    expect(result.handoff).toMatchObject({ outcomeCode: "REPORT_SUBMISSION_PARTIAL", resultStatus: "EXECUTED", mutationPerformed: true });
    expectValidHandoff(result.handoff);
  });

  it("reports SUBMITTED when every question is now answered", async () => {
    mocks.submitReportAnswerMessage.mockResolvedValue({
      ok: true,
      data: { report: { status: "SUBMITTED", templateName: "Haftalık Yönetim Raporu", answeredNow: ["important_development", "customer_risk"] } },
    });

    const result = await reportSubmissionConversationExtension.execute("Haftalık raporumu gönder: her şey yolunda.");

    expect(result.handoff).toMatchObject({ outcomeCode: "REPORT_SUBMISSION_SUBMITTED", resultStatus: "EXECUTED", mutationPerformed: true });
    expectValidHandoff(result.handoff);
  });

  it("falls through as NOT_HANDLED when there's no open submission for this rep", async () => {
    mocks.submitReportAnswerMessage.mockResolvedValue({ ok: true, data: { report: { status: "NO_OPEN_SUBMISSION" } } });
    const result = await reportSubmissionConversationExtension.execute("raporumu doldurmak istiyorum");
    expect(result).toEqual({ status: "NOT_HANDLED", handoff: null });
  });

  it("falls through as NOT_HANDLED when nothing could be extracted", async () => {
    mocks.submitReportAnswerMessage.mockResolvedValue({ ok: true, data: { report: { status: "PARSE_FAILED" } } });
    const result = await reportSubmissionConversationExtension.execute("raporumu doldurmak istiyorum ama ne yazacağımı bilmiyorum");
    expect(result).toEqual({ status: "NOT_HANDLED", handoff: null });
  });

  it("reports FAILED when the request itself fails", async () => {
    mocks.submitReportAnswerMessage.mockResolvedValue({ ok: false, error: "Baglanti kurulamadi." });
    const result = await reportSubmissionConversationExtension.execute("raporumu gönder");
    expect(result.handoff).toMatchObject({ outcomeCode: "REPORT_SUBMISSION_REQUEST_FAILED", resultStatus: "FAILED" });
    expectValidHandoff(result.handoff);
  });
});
