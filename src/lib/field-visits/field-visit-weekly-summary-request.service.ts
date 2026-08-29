import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { listActiveNotificationRecipientRecords } from "@/lib/core/organization-members/organization-member.repository";
import { resolveFieldVisitWeeklySummaryForRequest } from "./field-visit-weekly-summary.service";
import type { FieldVisitWeeklySummary } from "./field-visit-weekly-summary.types";
import { resolveCompanyMonthlyGoalStatus, type CompanyMonthlyGoalStatus } from "./field-visit-company-goal-status.service";
import { resolveRepGoalAchievement, resolveTeamGoalAchievement, type RepGoalStatus, type TeamGoalStatus } from "@/lib/rep-goals/rep-goal-achievement.service";

export type FieldVisitWeeklySummaryLookupResult =
  | Readonly<{ status: "ALLOWED"; summary: FieldVisitWeeklySummary; scope: "SELF" | "COLLEAGUE" | "TEAM"; repFullName: string | null; companyGoalStatus: CompanyMonthlyGoalStatus | null; personalGoalStatus: RepGoalStatus | TeamGoalStatus | null }>
  | Readonly<{ status: "DENIED" }>
  | Readonly<{ status: "NOT_FOUND" }>
  | Readonly<{ status: "AMBIGUOUS"; options: readonly string[] }>;

const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9@+]/g, "");

const SELF_KEYWORDS = ["ben", "benim", "kendim", "kendi"];
const TEAM_KEYWORDS = ["ekip", "takim"];

function isSelfReference(value: string): boolean {
  const n = normalize(value);
  return SELF_KEYWORDS.some((keyword) => n.includes(keyword));
}
function isTeamReference(value: string): boolean {
  const n = normalize(value);
  return TEAM_KEYWORDS.some((keyword) => n.includes(keyword));
}

/**
 * targetReference is the raw, free-text "who is this for" fragment the
 * conversation extension pulled out of the utterance — null/empty means
 * "my own week", "ekip"/"takım" means the whole team, anything else is
 * matched against active organization members by name. Role gating itself
 * lives in resolveFieldVisitWeeklySummaryForRequest — this function only
 * resolves WHO the request is about.
 */
export async function resolveFieldVisitWeeklySummaryRequest(input: {
  authContext: AuthContext;
  targetReference: string | null;
}): Promise<FieldVisitWeeklySummaryLookupResult> {
  const organizationId = input.authContext.organization.id;
  const actorUserId = input.authContext.user.id;
  const actorRole = input.authContext.membership.role;
  const raw = input.targetReference?.trim() ?? "";

  // personalGoalStatus is a single rep's status for SELF/COLLEAGUE, and the
  // whole-team aggregate (across every rep with an active goal) for TEAM.
  async function allowedWithGoalStatus(summary: FieldVisitWeeklySummary, scope: "SELF" | "COLLEAGUE" | "TEAM", repFullName: string | null, repUserId?: string): Promise<FieldVisitWeeklySummaryLookupResult> {
    const [companyGoalStatus, personalGoalStatus] = await Promise.all([
      resolveCompanyMonthlyGoalStatus(organizationId),
      scope === "TEAM" ? resolveTeamGoalAchievement(organizationId) : repUserId ? resolveRepGoalAchievement(organizationId, repUserId) : Promise.resolve(null),
    ]);
    return { status: "ALLOWED", summary, scope, repFullName, companyGoalStatus, personalGoalStatus };
  }

  if (!raw || isSelfReference(raw)) {
    const access = await resolveFieldVisitWeeklySummaryForRequest({ organizationId, actorUserId, actorRole, targetRepUserId: actorUserId });
    return access.status === "ALLOWED" ? allowedWithGoalStatus(access.summary, "SELF", null, actorUserId) : { status: "DENIED" };
  }

  if (isTeamReference(raw)) {
    const access = await resolveFieldVisitWeeklySummaryForRequest({ organizationId, actorUserId, actorRole });
    return access.status === "ALLOWED" ? allowedWithGoalStatus(access.summary, "TEAM", null) : { status: "DENIED" };
  }

  const members = await listActiveNotificationRecipientRecords(organizationId);
  const needle = normalize(raw);
  const named = members.filter((member): member is typeof member & { fullName: string } => Boolean(member.fullName));
  const exact = named.filter((member) => normalize(member.fullName) === needle);
  const matches = exact.length > 0 ? exact : named.filter((member) => normalize(member.fullName).includes(needle));
  if (matches.length === 0) return { status: "NOT_FOUND" };
  if (matches.length > 1) return { status: "AMBIGUOUS", options: matches.slice(0, 5).map((member) => member.fullName) };

  const target = matches[0]!;
  const access = await resolveFieldVisitWeeklySummaryForRequest({ organizationId, actorUserId, actorRole, targetRepUserId: target.userId });
  return access.status === "ALLOWED"
    ? allowedWithGoalStatus(access.summary, "COLLEAGUE", target.fullName, target.userId)
    : { status: "DENIED" };
}
