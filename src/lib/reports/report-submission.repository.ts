import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/shared/prisma";

const SUBMISSION_WITH_CONTEXT = {
  include: {
    templateVersion: true,
    answers: true,
    assignment: { include: { template: true } },
  },
} as const;

export type ReportSubmissionWithContext = NonNullable<Awaited<ReturnType<typeof findOpenSubmissionForAssignee>>>;

/**
 * The submission the assignee should be filling in right now — the
 * earliest-due active assignment that hasn't reached SUBMITTED. Mirrors
 * rep-goal.repository.ts's convention of one clear "current" record per
 * person rather than requiring the caller to pick a period.
 */
export function findOpenSubmissionForAssignee(organizationId: string, assigneeUserId: string) {
  return prisma.reportSubmission.findFirst({
    where: {
      organizationId,
      status: { not: "SUBMITTED" },
      assignment: { assigneeUserId, active: true },
    },
    orderBy: { dueDate: "asc" },
    ...SUBMISSION_WITH_CONTEXT,
  });
}

export function findLatestPendingReviewSubmissionForAssignee(organizationId: string, assigneeUserId: string) {
  return prisma.reportSubmission.findFirst({
    where: {
      organizationId,
      status: "SUBMITTED",
      reviewerStatus: "PENDING",
      assignment: { assigneeUserId },
    },
    orderBy: { submittedAt: "desc" },
    ...SUBMISSION_WITH_CONTEXT,
  });
}

export async function upsertReportAnswers(submissionId: string, answers: readonly { questionKey: string; value: string }[]): Promise<void> {
  for (const answer of answers) {
    await prisma.reportAnswer.upsert({
      where: { submissionId_questionKey: { submissionId, questionKey: answer.questionKey } },
      create: { submissionId, questionKey: answer.questionKey, valueJson: answer.value },
      update: { valueJson: answer.value },
    });
  }
}

export function markSubmissionSubmitted(organizationId: string, submissionId: string) {
  return prisma.reportSubmission.update({
    where: { id: submissionId, organizationId },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
}

export async function setSubmissionReviewDecision(
  organizationId: string,
  submissionId: string,
  input: { reviewerStatus: "APPROVED" | "NEEDS_REVISION"; reviewerUserId: string; note: string | null },
) {
  const existing = await prisma.reportSubmission.findUniqueOrThrow({ where: { id: submissionId, organizationId }, select: { provenanceJson: true } });
  const provenance = (existing.provenanceJson && typeof existing.provenanceJson === "object" ? existing.provenanceJson : {}) as Record<string, unknown>;
  return prisma.reportSubmission.update({
    where: { id: submissionId, organizationId },
    data: {
      reviewerStatus: input.reviewerStatus,
      provenanceJson: {
        ...provenance,
        review: { status: input.reviewerStatus, reviewerUserId: input.reviewerUserId, note: input.note, reviewedAt: new Date().toISOString() },
      } as Prisma.InputJsonValue,
    },
  });
}
