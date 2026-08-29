import type { OrganizationRole } from "@prisma/client";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { buildAuthContextForOrganizationMember } from "@/lib/auth/context/auth-context-for-member";
import { normalizeTurkish, resolveRepByName } from "@/lib/core/organization-members/member-name-resolution";
import { notify } from "@/lib/core/notifications/notification.service";
import {
  createBusinessCandidateActionRuntimeExecutor,
  decideBusinessCandidateChanges,
  promoteBusinessCandidate,
} from "@/lib/business-reality-candidates";
import { parseRepRequestReview } from "./rep-request-review-parser.service";
import {
  customerNameRawFromChanges,
  findPendingRepRequestCandidates,
  repRequestDomainForTargetDomain,
  repRequestDomainLabel,
  targetDomainForRepRequestDomain,
} from "./rep-request.repository";
import type { RepRequestDomain, RepRequestReviewDecision } from "./rep-request.types";

const MANAGER_ROLES: readonly OrganizationRole[] = ["TEAM_LEAD", "MANAGER", "EXECUTIVE", "OWNER"];

const NOTIFICATION_TYPE = "REP_REQUEST_REVIEWED";
const NOTIFICATION_ENTITY_TYPE = "BusinessCandidate";

export type RepRequestReviewOutcome =
  | Readonly<{ status: "PARSE_FAILED" }>
  | Readonly<{ status: "DENIED" }>
  | Readonly<{ status: "REP_NOT_FOUND" }>
  | Readonly<{ status: "REP_AMBIGUOUS"; options: readonly string[] }>
  | Readonly<{ status: "NO_PENDING_REQUEST"; repFullName: string }>
  | Readonly<{ status: "CANDIDATE_AMBIGUOUS"; repFullName: string; options: readonly string[] }>
  | Readonly<{ status: "DECIDED"; decision: RepRequestReviewDecision; domain: RepRequestDomain; repFullName: string; customerNameRaw: string }>;

export async function reviewRepRequest(input: { authContext: AuthContext; message: string }): Promise<RepRequestReviewOutcome> {
  const organizationId = input.authContext.organization.id;
  const actorRole = input.authContext.membership.role;
  if (!MANAGER_ROLES.includes(actorRole)) return { status: "DENIED" };

  const extraction = await parseRepRequestReview({ message: input.message });
  if (!extraction) return { status: "PARSE_FAILED" };

  const target = await resolveRepByName(input.authContext, extraction.repNameRaw);
  if (target.status !== "RESOLVED") return target;

  const pending = await findPendingRepRequestCandidates(organizationId, target.userId);
  const domainFiltered = extraction.domain
    ? pending.filter((candidate) => repRequestDomainForTargetDomain(candidate.targetDomain) === extraction.domain)
    : pending;
  const entityNarrowed = extraction.entityReference
    ? domainFiltered.filter((candidate) => {
        const customerNameRaw = customerNameRawFromChanges(candidate.changes);
        return customerNameRaw && normalizeTurkish(customerNameRaw).includes(normalizeTurkish(extraction.entityReference!));
      })
    : domainFiltered;
  // If the extracted entityReference doesn't match any customer name on a
  // pending candidate (e.g. the LLM captured a date/amount mention instead
  // of a customer name), it didn't actually narrow anything down — fall
  // back to the domain-filtered set rather than reporting nothing found.
  const entityFiltered = entityNarrowed.length > 0 ? entityNarrowed : domainFiltered;

  if (entityFiltered.length === 0) return { status: "NO_PENDING_REQUEST", repFullName: target.fullName };
  if (entityFiltered.length > 1) {
    return {
      status: "CANDIDATE_AMBIGUOUS",
      repFullName: target.fullName,
      options: entityFiltered.map((candidate) => {
        const domain = repRequestDomainForTargetDomain(candidate.targetDomain);
        const customerNameRaw = customerNameRawFromChanges(candidate.changes) ?? "";
        return `${domain ? repRequestDomainLabel(domain) : candidate.targetDomain}, ${customerNameRaw}`;
      }),
    };
  }

  const candidate = entityFiltered[0]!;
  const domain = repRequestDomainForTargetDomain(candidate.targetDomain);
  if (!domain) throw new Error(`REP_REQUEST_UNKNOWN_TARGET_DOMAIN:${candidate.targetDomain}`);
  const customerNameRaw = customerNameRawFromChanges(candidate.changes) ?? "";
  const allChangeIds = candidate.changes.map((change) => change.id);

  await decideBusinessCandidateChanges({
    organizationId,
    candidateId: candidate.id,
    actorUserId: input.authContext.user.id,
    approvedChangeIds: extraction.decision === "APPROVE" ? allChangeIds : [],
    rejectedChangeIds: extraction.decision === "APPROVE" ? [] : allChangeIds,
    reason: "REP_REQUEST_DECISION",
  });

  if (extraction.decision === "APPROVE") {
    const proposerAuthContext = await buildAuthContextForOrganizationMember(target.userId, organizationId);
    await promoteBusinessCandidate({
      organizationId,
      candidateId: candidate.id,
      actorUserId: input.authContext.user.id,
      execute: createBusinessCandidateActionRuntimeExecutor(proposerAuthContext, ["orders.write", "quotes.write", "payments.write"]),
    });
  }

  await notify({
    organizationId,
    recipientUserId: target.userId,
    type: NOTIFICATION_TYPE,
    title: extraction.decision === "APPROVE"
      ? `${repRequestDomainLabel(domain)} talebin onaylandı`
      : `${repRequestDomainLabel(domain)} talebin reddedildi`,
    body: customerNameRaw || undefined,
    entityType: NOTIFICATION_ENTITY_TYPE,
    entityId: candidate.id,
  });

  return { status: "DECIDED", decision: extraction.decision, domain, repFullName: target.fullName, customerNameRaw };
}
