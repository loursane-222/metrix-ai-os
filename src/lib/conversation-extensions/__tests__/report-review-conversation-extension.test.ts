import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateConversationExtensionHandoff } from "../conversation-extension-handoff";

const mocks = vi.hoisted(() => ({ submitReportReviewMessage: vi.fn() }));
vi.mock("@/lib/reports/reports-client", () => ({ submitReportReviewMessage: mocks.submitReportReviewMessage }));

const { reportReviewConversationExtension } = await import("../report-review-conversation-extension");

// The server re-validates every handoff through this exact function
// (conversation-extension-handoff.ts) before trusting it — asserting
// against the real validator catches disallowed-character regressions
// that a plain shape check would miss.
function expectValidHandoff(handoff: unknown) {
  expect(validateConversationExtensionHandoff(handoff)).not.toBeNull();
}

beforeEach(() => { vi.clearAllMocks(); });

describe("report-review-conversation-extension", () => {
  it("does not handle an utterance with no review keyword", async () => {
    const result = await reportReviewConversationExtension.execute("raporlar hakkında ne düşünüyorsun?");
    expect(result.status).toBe("NOT_HANDLED");
    expect(mocks.submitReportReviewMessage).not.toHaveBeenCalled();
  });

  it("approves and reports EXECUTED", async () => {
    mocks.submitReportReviewMessage.mockResolvedValue({
      ok: true,
      data: { review: { status: "REVIEWED", repFullName: "Ahmet Yılmaz", decision: "APPROVED", templateName: "Haftalık Yönetim Raporu" } },
    });

    const result = await reportReviewConversationExtension.execute("Ahmet'in bu haftaki raporunu onayla.");

    expect(mocks.submitReportReviewMessage).toHaveBeenCalledWith("Ahmet'in bu haftaki raporunu onayla.");
    expect(result.handoff).toMatchObject({ outcomeCode: "REPORT_REVIEW_APPROVED", resultStatus: "EXECUTED", mutationPerformed: true });
    expect(result.handoff?.candidateNames[0]).toContain("Ahmet Yılmaz");
    expectValidHandoff(result.handoff);
  });

  it("requests revision and reports EXECUTED with a different outcome code", async () => {
    mocks.submitReportReviewMessage.mockResolvedValue({
      ok: true,
      data: { review: { status: "REVIEWED", repFullName: "Ayşe Kaya", decision: "NEEDS_REVISION", templateName: "Haftalık Yönetim Raporu" } },
    });

    const result = await reportReviewConversationExtension.execute("Ayşe'nin raporu eksik, revize iste.");

    expect(result.handoff).toMatchObject({ outcomeCode: "REPORT_REVIEW_NEEDS_REVISION", resultStatus: "EXECUTED" });
    expectValidHandoff(result.handoff);
  });

  it("falls through as NOT_HANDLED when the parser found nothing to decide", async () => {
    mocks.submitReportReviewMessage.mockResolvedValue({ ok: true, data: { review: { status: "PARSE_FAILED" } } });
    const result = await reportReviewConversationExtension.execute("raporu bir bak istersen onayla ya da onaylama");
    expect(result).toEqual({ status: "NOT_HANDLED", handoff: null });
  });

  it("reports a FAILED-shaped handoff when a plain EMPLOYEE is denied", async () => {
    mocks.submitReportReviewMessage.mockResolvedValue({ ok: true, data: { review: { status: "DENIED" } } });
    const result = await reportReviewConversationExtension.execute("Ahmet'in raporunu onayla");
    expect(result.handoff).toMatchObject({ outcomeCode: "REPORT_REVIEW_DENIED", resultStatus: "FAILED" });
    expectValidHandoff(result.handoff);
  });

  it("asks for clarification when the rep name can't be resolved", async () => {
    mocks.submitReportReviewMessage.mockResolvedValue({ ok: true, data: { review: { status: "REP_NOT_FOUND" } } });
    const result = await reportReviewConversationExtension.execute("Bilinmeyen Kişi'nin raporunu onayla");
    expect(result.handoff).toMatchObject({ outcomeCode: "REPORT_REVIEW_REP_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" });
    expectValidHandoff(result.handoff);
  });

  it("asks for clarification with candidate names when the rep name is ambiguous", async () => {
    mocks.submitReportReviewMessage.mockResolvedValue({ ok: true, data: { review: { status: "REP_AMBIGUOUS", options: ["Ahmet Yılmaz", "Ahmet Kara"] } } });
    const result = await reportReviewConversationExtension.execute("Ahmet'in raporunu onayla");
    expect(result.handoff).toMatchObject({ outcomeCode: "REPORT_REVIEW_REP_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", candidateNames: ["Ahmet Yılmaz", "Ahmet Kara"] });
    expectValidHandoff(result.handoff);
  });

  it("reports no pending submission for the rep", async () => {
    mocks.submitReportReviewMessage.mockResolvedValue({ ok: true, data: { review: { status: "NO_PENDING_SUBMISSION", repFullName: "Ahmet Yılmaz" } } });
    const result = await reportReviewConversationExtension.execute("Ahmet'in raporunu onayla");
    expect(result.handoff).toMatchObject({ outcomeCode: "REPORT_REVIEW_NO_PENDING_SUBMISSION", resultStatus: "CLARIFICATION_REQUIRED" });
    expectValidHandoff(result.handoff);
  });

  it("reports FAILED when the request itself fails", async () => {
    mocks.submitReportReviewMessage.mockResolvedValue({ ok: false, error: "Baglanti kurulamadi." });
    const result = await reportReviewConversationExtension.execute("Ahmet'in raporunu onayla");
    expect(result.handoff).toMatchObject({ outcomeCode: "REPORT_REVIEW_REQUEST_FAILED", resultStatus: "FAILED" });
    expectValidHandoff(result.handoff);
  });
});
