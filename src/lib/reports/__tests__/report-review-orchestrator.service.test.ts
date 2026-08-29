import { beforeEach, describe, expect, it, vi } from "vitest";

const { parseReportReviewMock, listActiveNotificationRecipientRecordsMock, findLatestPendingReviewSubmissionForAssigneeMock, setSubmissionReviewDecisionMock, notifyMock } = vi.hoisted(() => ({
  parseReportReviewMock: vi.fn(),
  listActiveNotificationRecipientRecordsMock: vi.fn(),
  findLatestPendingReviewSubmissionForAssigneeMock: vi.fn(),
  setSubmissionReviewDecisionMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock("../report-review-parser.service", () => ({ parseReportReview: parseReportReviewMock }));
vi.mock("@/lib/core/organization-members/organization-member.repository", () => ({
  listActiveNotificationRecipientRecords: listActiveNotificationRecipientRecordsMock,
}));
vi.mock("../report-submission.repository", () => ({
  findLatestPendingReviewSubmissionForAssignee: findLatestPendingReviewSubmissionForAssigneeMock,
  setSubmissionReviewDecision: setSubmissionReviewDecisionMock,
}));
vi.mock("@/lib/core/notifications/notification.service", () => ({ notify: notifyMock }));

import { processReportReviewMessage } from "../report-review-orchestrator.service";

const authContext = (role: string, userId = "user-1", fullName: string | null = "Murat Arda") => ({
  user: { id: userId, fullName },
  organization: { id: "org-1" },
  membership: { role },
} as never);

const pendingSubmission = { id: "submission-1", assignment: { template: { name: "Haftalık Yönetim Raporu" } } };

describe("processReportReviewMessage", () => {
  beforeEach(() => {
    parseReportReviewMock.mockReset();
    listActiveNotificationRecipientRecordsMock.mockReset().mockResolvedValue([]);
    findLatestPendingReviewSubmissionForAssigneeMock.mockReset();
    setSubmissionReviewDecisionMock.mockReset().mockResolvedValue({});
    notifyMock.mockReset().mockResolvedValue({});
  });

  it("denies a plain EMPLOYEE from reviewing any report, without even parsing", async () => {
    const result = await processReportReviewMessage({ authContext: authContext("EMPLOYEE"), message: "Ahmet'in raporunu onayla" });
    expect(result).toEqual({ status: "DENIED" });
    expect(parseReportReviewMock).not.toHaveBeenCalled();
  });

  it("returns PARSE_FAILED when the message isn't a clear review decision", async () => {
    parseReportReviewMock.mockResolvedValue(null);
    const result = await processReportReviewMessage({ authContext: authContext("MANAGER"), message: "raporlar nasıl gidiyor" });
    expect(result).toEqual({ status: "PARSE_FAILED" });
  });

  it("resolves 'kendi' to the actor's own userId", async () => {
    parseReportReviewMock.mockResolvedValue({ repNameRaw: "kendi", decision: "APPROVED", note: null });
    findLatestPendingReviewSubmissionForAssigneeMock.mockResolvedValue(pendingSubmission);

    const result = await processReportReviewMessage({ authContext: authContext("MANAGER", "user-1", "Murat Arda"), message: "kendi raporumu onayla" });

    expect(listActiveNotificationRecipientRecordsMock).not.toHaveBeenCalled();
    expect(findLatestPendingReviewSubmissionForAssigneeMock).toHaveBeenCalledWith("org-1", "user-1");
    expect(result).toEqual({ status: "REVIEWED", repFullName: "Murat Arda", decision: "APPROVED", templateName: "Haftalık Yönetim Raporu" });
  });

  it("approves a named colleague's report and notifies them", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([{ userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" }]);
    parseReportReviewMock.mockResolvedValue({ repNameRaw: "Ahmet", decision: "APPROVED", note: null });
    findLatestPendingReviewSubmissionForAssigneeMock.mockResolvedValue(pendingSubmission);

    const result = await processReportReviewMessage({ authContext: authContext("MANAGER"), message: "Ahmet'in bu haftaki raporunu onayla." });

    expect(setSubmissionReviewDecisionMock).toHaveBeenCalledWith("org-1", "submission-1", { reviewerStatus: "APPROVED", reviewerUserId: "user-1", note: null });
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: "user-2", type: "REPORT_REVIEWED", entityId: "submission-1" }));
    expect(result).toEqual({ status: "REVIEWED", repFullName: "Ahmet Yılmaz", decision: "APPROVED", templateName: "Haftalık Yönetim Raporu" });
  });

  it("requests revision with a note", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([{ userId: "user-2", fullName: "Ayşe Kaya", role: "EMPLOYEE" }]);
    parseReportReviewMock.mockResolvedValue({ repNameRaw: "Ayşe", decision: "NEEDS_REVISION", note: "Müşteri riskini de yazsın." });
    findLatestPendingReviewSubmissionForAssigneeMock.mockResolvedValue(pendingSubmission);

    const result = await processReportReviewMessage({ authContext: authContext("MANAGER"), message: "Ayşe'nin raporu eksik, geri gönder." });

    expect(setSubmissionReviewDecisionMock).toHaveBeenCalledWith("org-1", "submission-1", { reviewerStatus: "NEEDS_REVISION", reviewerUserId: "user-1", note: "Müşteri riskini de yazsın." });
    expect(result).toEqual({ status: "REVIEWED", repFullName: "Ayşe Kaya", decision: "NEEDS_REVISION", templateName: "Haftalık Yönetim Raporu" });
  });

  it("returns REP_NOT_FOUND without touching any submission when the name doesn't match", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([{ userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" }]);
    parseReportReviewMock.mockResolvedValue({ repNameRaw: "Bilinmeyen Kişi", decision: "APPROVED", note: null });

    const result = await processReportReviewMessage({ authContext: authContext("MANAGER"), message: "Bilinmeyen Kişi'nin raporunu onayla" });

    expect(result).toEqual({ status: "REP_NOT_FOUND" });
    expect(setSubmissionReviewDecisionMock).not.toHaveBeenCalled();
  });

  it("returns REP_AMBIGUOUS when multiple members share the same partial name", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([
      { userId: "user-2", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" },
      { userId: "user-3", fullName: "Ahmet Kara", role: "EMPLOYEE" },
    ]);
    parseReportReviewMock.mockResolvedValue({ repNameRaw: "Ahmet", decision: "APPROVED", note: null });

    const result = await processReportReviewMessage({ authContext: authContext("MANAGER"), message: "Ahmet'in raporunu onayla" });

    expect(result).toEqual({ status: "REP_AMBIGUOUS", options: ["Ahmet Yılmaz", "Ahmet Kara"] });
  });

  it("returns NO_PENDING_SUBMISSION when the rep has nothing awaiting review", async () => {
    parseReportReviewMock.mockResolvedValue({ repNameRaw: "kendi", decision: "APPROVED", note: null });
    findLatestPendingReviewSubmissionForAssigneeMock.mockResolvedValue(null);

    const result = await processReportReviewMessage({ authContext: authContext("MANAGER", "user-1", "Murat Arda"), message: "kendi raporumu onayla" });

    expect(result).toEqual({ status: "NO_PENDING_SUBMISSION", repFullName: "Murat Arda" });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("allows a TEAM_LEAD and an OWNER, not just MANAGER", async () => {
    parseReportReviewMock.mockResolvedValue({ repNameRaw: "kendi", decision: "APPROVED", note: null });
    findLatestPendingReviewSubmissionForAssigneeMock.mockResolvedValue(pendingSubmission);
    const teamLead = await processReportReviewMessage({ authContext: authContext("TEAM_LEAD"), message: "x" });
    const owner = await processReportReviewMessage({ authContext: authContext("OWNER"), message: "x" });
    expect(teamLead.status).toBe("REVIEWED");
    expect(owner.status).toBe("REVIEWED");
  });
});
