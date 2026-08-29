import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { notify } from "@/lib/core/notifications/notification.service";
import { buildOpenQuestionList } from "./report-question";
import { parseReportAnswers } from "./report-answer-parser.service";
import {
  findOpenSubmissionForAssignee,
  markSubmissionSubmitted,
  upsertReportAnswers,
} from "./report-submission.repository";

const NOTIFICATION_TYPE = "REPORT_SUBMITTED";
const NOTIFICATION_ENTITY_TYPE = "ReportSubmission";

export type ReportSubmissionOutcome =
  | Readonly<{ status: "NO_OPEN_SUBMISSION" }>
  | Readonly<{ status: "PARSE_FAILED" }>
  | Readonly<{ status: "PARTIAL"; templateName: string; answeredNow: readonly string[]; remainingQuestions: readonly string[] }>
  | Readonly<{ status: "SUBMITTED"; templateName: string; answeredNow: readonly string[] }>;

export async function processReportSubmissionMessage(input: { authContext: AuthContext; message: string }): Promise<ReportSubmissionOutcome> {
  const organizationId = input.authContext.organization.id;
  const assigneeUserId = input.authContext.user.id;

  const submission = await findOpenSubmissionForAssignee(organizationId, assigneeUserId);
  if (!submission) return { status: "NO_OPEN_SUBMISSION" };

  const openQuestions = buildOpenQuestionList(submission.templateVersion, submission.answers);
  if (openQuestions.length === 0) return { status: "NO_OPEN_SUBMISSION" };

  const extracted = await parseReportAnswers({ message: input.message, questions: openQuestions });
  if (extracted.length === 0) return { status: "PARSE_FAILED" };

  await upsertReportAnswers(submission.id, extracted.map((answer) => ({ questionKey: answer.key, value: answer.value })));

  const answeredKeysNow = new Set(extracted.map((answer) => answer.key));
  const remainingQuestions = openQuestions.filter((question) => !answeredKeysNow.has(question.key));
  const templateName = submission.assignment.template.name;
  const answeredNow = extracted.map((answer) => answer.key);

  if (remainingQuestions.length > 0) {
    return { status: "PARTIAL", templateName, answeredNow, remainingQuestions: remainingQuestions.map((question) => question.label) };
  }

  await markSubmissionSubmitted(organizationId, submission.id);

  const managerUserId = submission.assignment.managerUserId;
  if (managerUserId) {
    await notify({
      organizationId,
      recipientUserId: managerUserId,
      type: NOTIFICATION_TYPE,
      title: `${input.authContext.user.fullName ?? "Bir çalışan"} haftalık raporunu gönderdi`,
      body: templateName,
      entityType: NOTIFICATION_ENTITY_TYPE,
      entityId: submission.id,
    });
  }

  return { status: "SUBMITTED", templateName, answeredNow };
}
