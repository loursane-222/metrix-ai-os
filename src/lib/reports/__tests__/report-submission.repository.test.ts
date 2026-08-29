import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirstMock, upsertMock, updateMock, findUniqueOrThrowMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  upsertMock: vi.fn(),
  updateMock: vi.fn(),
  findUniqueOrThrowMock: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    reportSubmission: { findFirst: findFirstMock, update: updateMock, findUniqueOrThrow: findUniqueOrThrowMock },
    reportAnswer: { upsert: upsertMock },
  },
}));

import {
  findLatestPendingReviewSubmissionForAssignee,
  findOpenSubmissionForAssignee,
  markSubmissionSubmitted,
  setSubmissionReviewDecision,
  upsertReportAnswers,
} from "../report-submission.repository";

describe("findOpenSubmissionForAssignee", () => {
  it("queries the earliest-due active, not-yet-submitted assignment for this rep", async () => {
    findFirstMock.mockReset().mockResolvedValue(null);
    await findOpenSubmissionForAssignee("org-1", "user-1");
    expect(findFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: "org-1", status: { not: "SUBMITTED" }, assignment: { assigneeUserId: "user-1", active: true } },
      orderBy: { dueDate: "asc" },
    }));
  });
});

describe("findLatestPendingReviewSubmissionForAssignee", () => {
  it("queries the most recently submitted, still-PENDING-review submission for this rep", async () => {
    findFirstMock.mockReset().mockResolvedValue(null);
    await findLatestPendingReviewSubmissionForAssignee("org-1", "user-2");
    expect(findFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: "org-1", status: "SUBMITTED", reviewerStatus: "PENDING", assignment: { assigneeUserId: "user-2" } },
      orderBy: { submittedAt: "desc" },
    }));
  });
});

describe("upsertReportAnswers", () => {
  it("upserts each answer keyed by submissionId + questionKey", async () => {
    upsertMock.mockReset().mockResolvedValue({});
    await upsertReportAnswers("submission-1", [{ questionKey: "important_development", value: "x" }, { questionKey: "customer_risk", value: "y" }]);

    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock).toHaveBeenCalledWith({
      where: { submissionId_questionKey: { submissionId: "submission-1", questionKey: "important_development" } },
      create: { submissionId: "submission-1", questionKey: "important_development", valueJson: "x" },
      update: { valueJson: "x" },
    });
  });
});

describe("markSubmissionSubmitted", () => {
  it("sets status SUBMITTED with a real submittedAt timestamp, scoped to the organization", async () => {
    updateMock.mockReset().mockResolvedValue({});
    await markSubmissionSubmitted("org-1", "submission-1");
    expect(updateMock).toHaveBeenCalledWith({ where: { id: "submission-1", organizationId: "org-1" }, data: { status: "SUBMITTED", submittedAt: expect.any(Date) } });
  });
});

describe("setSubmissionReviewDecision", () => {
  beforeEach(() => {
    findUniqueOrThrowMock.mockReset();
    updateMock.mockReset().mockResolvedValue({});
  });

  it("merges the review decision into existing provenanceJson rather than overwriting it", async () => {
    findUniqueOrThrowMock.mockResolvedValue({ provenanceJson: { source: "MANAGER_ASSIGNMENT" } });
    await setSubmissionReviewDecision("org-1", "submission-1", { reviewerStatus: "APPROVED", reviewerUserId: "manager-1", note: null });

    const call = updateMock.mock.calls[0]![0];
    expect(call.where).toEqual({ id: "submission-1", organizationId: "org-1" });
    expect(call.data.reviewerStatus).toBe("APPROVED");
    expect(call.data.provenanceJson.source).toBe("MANAGER_ASSIGNMENT");
    expect(call.data.provenanceJson.review).toMatchObject({ status: "APPROVED", reviewerUserId: "manager-1", note: null });
  });

  it("tolerates a null prior provenanceJson", async () => {
    findUniqueOrThrowMock.mockResolvedValue({ provenanceJson: null });
    await setSubmissionReviewDecision("org-1", "submission-1", { reviewerStatus: "NEEDS_REVISION", reviewerUserId: "manager-1", note: "eksik" });

    const call = updateMock.mock.calls[0]![0];
    expect(call.data.provenanceJson.review).toMatchObject({ status: "NEEDS_REVISION", note: "eksik" });
  });
});
