import type { OrganizationRole } from "@prisma/client";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { listActiveNotificationRecipientRecords } from "@/lib/core/organization-members/organization-member.repository";
import { notify } from "@/lib/core/notifications/notification.service";
import { parseReportReview } from "./report-review-parser.service";
import { findLatestPendingReviewSubmissionForAssignee, setSubmissionReviewDecision } from "./report-submission.repository";
import type { ReportReviewDecision } from "./report-review-parser.types";

// Same tier as field-visit-weekly-summary-request.service.ts's colleague/team
// view gate and rep-goal-create-orchestrator.service.ts's goal-setting gate —
// reviewing a subordinate's report is a managerial action.
const MANAGER_ROLES: readonly OrganizationRole[] = ["TEAM_LEAD", "MANAGER", "EXECUTIVE", "OWNER"];

const NOTIFICATION_TYPE = "REPORT_REVIEWED";
const NOTIFICATION_ENTITY_TYPE = "ReportSubmission";

const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9@+]/g, "");
const SELF_KEYWORDS = ["ben", "benim", "kendim", "kendi"];

export type ReportReviewOutcome =
  | Readonly<{ status: "PARSE_FAILED" }>
  | Readonly<{ status: "DENIED" }>
  | Readonly<{ status: "REP_NOT_FOUND" }>
  | Readonly<{ status: "REP_AMBIGUOUS"; options: readonly string[] }>
  | Readonly<{ status: "NO_PENDING_SUBMISSION"; repFullName: string }>
  | Readonly<{ status: "REVIEWED"; repFullName: string; decision: ReportReviewDecision; templateName: string }>;

export async function processReportReviewMessage(input: { authContext: AuthContext; message: string }): Promise<ReportReviewOutcome> {
  const organizationId = input.authContext.organization.id;
  const actorRole = input.authContext.membership.role;
  if (!MANAGER_ROLES.includes(actorRole)) return { status: "DENIED" };

  const extraction = await parseReportReview({ message: input.message });
  if (!extraction) return { status: "PARSE_FAILED" };

  const target = await resolveTargetRep(input.authContext, extraction.repNameRaw);
  if (target.status !== "RESOLVED") return target;

  const submission = await findLatestPendingReviewSubmissionForAssignee(organizationId, target.userId);
  if (!submission) return { status: "NO_PENDING_SUBMISSION", repFullName: target.fullName };

  await setSubmissionReviewDecision(organizationId, submission.id, {
    reviewerStatus: extraction.decision,
    reviewerUserId: input.authContext.user.id,
    note: extraction.note,
  });

  const templateName = submission.assignment.template.name;
  await notify({
    organizationId,
    recipientUserId: target.userId,
    type: NOTIFICATION_TYPE,
    title: extraction.decision === "APPROVED" ? `${templateName} raporun onaylandı` : `${templateName} raporun için revizyon isteniyor`,
    body: extraction.note ?? undefined,
    entityType: NOTIFICATION_ENTITY_TYPE,
    entityId: submission.id,
  });

  return { status: "REVIEWED", repFullName: target.fullName, decision: extraction.decision, templateName };
}

type TargetRepResolution =
  | { status: "RESOLVED"; userId: string; fullName: string }
  | { status: "REP_NOT_FOUND" }
  | { status: "REP_AMBIGUOUS"; options: readonly string[] };

async function resolveTargetRep(authContext: AuthContext, repNameRaw: string): Promise<TargetRepResolution> {
  if (SELF_KEYWORDS.some((keyword) => normalize(repNameRaw).includes(keyword))) {
    return { status: "RESOLVED", userId: authContext.user.id, fullName: authContext.user.fullName ?? "Siz" };
  }

  const members = await listActiveNotificationRecipientRecords(authContext.organization.id);
  const needle = normalize(repNameRaw);
  const named = members.filter((member): member is typeof member & { fullName: string } => Boolean(member.fullName));
  const exact = named.filter((member) => normalize(member.fullName) === needle);
  const matches = exact.length > 0 ? exact : named.filter((member) => normalize(member.fullName).includes(needle));

  if (matches.length === 0) return { status: "REP_NOT_FOUND" };
  if (matches.length > 1) return { status: "REP_AMBIGUOUS", options: matches.slice(0, 5).map((member) => member.fullName) };

  const target = matches[0]!;
  return { status: "RESOLVED", userId: target.userId, fullName: target.fullName };
}
