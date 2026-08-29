import { beforeEach, describe, expect, it, vi } from "vitest";

const { findOpenSubmissionForAssigneeMock, upsertReportAnswersMock, markSubmissionSubmittedMock, parseReportAnswersMock, notifyMock } = vi.hoisted(() => ({
  findOpenSubmissionForAssigneeMock: vi.fn(),
  upsertReportAnswersMock: vi.fn(),
  markSubmissionSubmittedMock: vi.fn(),
  parseReportAnswersMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock("../report-submission.repository", () => ({
  findOpenSubmissionForAssignee: findOpenSubmissionForAssigneeMock,
  upsertReportAnswers: upsertReportAnswersMock,
  markSubmissionSubmitted: markSubmissionSubmittedMock,
}));
vi.mock("../report-answer-parser.service", () => ({ parseReportAnswers: parseReportAnswersMock }));
vi.mock("@/lib/core/notifications/notification.service", () => ({ notify: notifyMock }));

import { processReportSubmissionMessage } from "../report-submission-orchestrator.service";

const authContext = (userId = "user-1", fullName: string | null = "Murat Arda") => ({
  user: { id: userId, fullName },
  organization: { id: "org-1" },
} as never);

const submission = (overrides: Partial<{ answers: { questionKey: string }[]; managerUserId: string | null }> = {}) => ({
  id: "submission-1",
  templateVersion: {
    fixedCoreJson: [
      { key: "important_development", label: "Bu haftanın önemli gelişmesi" },
      { key: "customer_risk", label: "Sistemde görünmeyen müşteri riski" },
    ],
    focusedSectionJson: null,
    dynamicQuestionsJson: null,
  },
  answers: overrides.answers ?? [],
  assignment: { template: { name: "Haftalık Yönetim Raporu" }, managerUserId: "managerUserId" in overrides ? overrides.managerUserId : "manager-1" },
});

describe("processReportSubmissionMessage", () => {
  beforeEach(() => {
    findOpenSubmissionForAssigneeMock.mockReset();
    upsertReportAnswersMock.mockReset().mockResolvedValue(undefined);
    markSubmissionSubmittedMock.mockReset().mockResolvedValue({});
    parseReportAnswersMock.mockReset();
    notifyMock.mockReset().mockResolvedValue({});
  });

  it("returns NO_OPEN_SUBMISSION when the rep has no open assignment", async () => {
    findOpenSubmissionForAssigneeMock.mockResolvedValue(null);
    const result = await processReportSubmissionMessage({ authContext: authContext(), message: "haftalık raporumu gönder" });
    expect(result).toEqual({ status: "NO_OPEN_SUBMISSION" });
    expect(parseReportAnswersMock).not.toHaveBeenCalled();
  });

  it("returns PARSE_FAILED without writing anything when no answer could be extracted", async () => {
    findOpenSubmissionForAssigneeMock.mockResolvedValue(submission());
    parseReportAnswersMock.mockResolvedValue([]);
    const result = await processReportSubmissionMessage({ authContext: authContext(), message: "bugün hava güzel" });
    expect(result).toEqual({ status: "PARSE_FAILED" });
    expect(upsertReportAnswersMock).not.toHaveBeenCalled();
  });

  it("stays PARTIAL and lists remaining questions when only some are answered", async () => {
    findOpenSubmissionForAssigneeMock.mockResolvedValue(submission());
    parseReportAnswersMock.mockResolvedValue([{ key: "important_development", value: "Arde Yapı ile anlaşma imzalandı." }]);

    const result = await processReportSubmissionMessage({ authContext: authContext(), message: "Bu hafta Arde Yapı ile anlaşma imzaladık." });

    expect(upsertReportAnswersMock).toHaveBeenCalledWith("submission-1", [{ questionKey: "important_development", value: "Arde Yapı ile anlaşma imzalandı." }]);
    expect(markSubmissionSubmittedMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "PARTIAL",
      templateName: "Haftalık Yönetim Raporu",
      answeredNow: ["important_development"],
      remainingQuestions: ["Sistemde görünmeyen müşteri riski"],
    });
  });

  it("marks SUBMITTED and notifies the manager once every question is answered", async () => {
    findOpenSubmissionForAssigneeMock.mockResolvedValue(submission({ answers: [{ questionKey: "customer_risk" }] }));
    parseReportAnswersMock.mockResolvedValue([{ key: "important_development", value: "Arde Yapı ile anlaşma imzalandı." }]);

    const result = await processReportSubmissionMessage({ authContext: authContext("user-1", "Murat Arda"), message: "Bu hafta Arde Yapı ile anlaşma imzaladık." });

    expect(markSubmissionSubmittedMock).toHaveBeenCalledWith("org-1", "submission-1");
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: "manager-1", type: "REPORT_SUBMITTED", entityId: "submission-1" }));
    expect(result).toEqual({ status: "SUBMITTED", templateName: "Haftalık Yönetim Raporu", answeredNow: ["important_development"] });
  });

  it("does not notify when the assignment has no managerUserId", async () => {
    findOpenSubmissionForAssigneeMock.mockResolvedValue(submission({ answers: [{ questionKey: "customer_risk" }], managerUserId: null }));
    parseReportAnswersMock.mockResolvedValue([{ key: "important_development", value: "x" }]);

    await processReportSubmissionMessage({ authContext: authContext(), message: "x" });

    expect(notifyMock).not.toHaveBeenCalled();
  });
});
