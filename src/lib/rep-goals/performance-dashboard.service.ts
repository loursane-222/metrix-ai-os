import type { OrganizationRole } from "@prisma/client";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { listActiveNotificationRecipientRecords } from "@/lib/core/organization-members/organization-member.repository";
import { resolveCompanyMonthlyGoalStatus, type CompanyMonthlyGoalStatus } from "@/lib/field-visits/field-visit-company-goal-status.service";
import { resolveRepGoalAchievement, resolveTeamGoalAchievement, type RepGoalStatus, type TeamGoalStatus } from "./rep-goal-achievement.service";
import { listDistinctPersonGoalOwners } from "./rep-goal.repository";

// Same tier as every other "see beyond your own week/goal" gate this
// session (field-visit-weekly-summary-request.service.ts,
// rep-goal-create-orchestrator.service.ts) — a plain EMPLOYEE only ever
// sees their own numbers on this dashboard.
const MANAGER_ROLES: readonly OrganizationRole[] = ["TEAM_LEAD", "MANAGER", "EXECUTIVE", "OWNER"];

export type RepPerformanceRow = Readonly<{ userId: string; fullName: string; goalStatus: RepGoalStatus }>;

export type PerformanceDashboardData =
  | Readonly<{ scope: "MANAGER"; companyGoalStatus: CompanyMonthlyGoalStatus | null; teamGoalStatus: TeamGoalStatus | null; reps: readonly RepPerformanceRow[] }>
  | Readonly<{ scope: "SELF"; companyGoalStatus: CompanyMonthlyGoalStatus | null; personalGoalStatus: RepGoalStatus | null }>;

/**
 * Pure orchestration — every number here comes from an already-built,
 * already-tested engine (company goal status, per-rep/team goal
 * achievement). No new aggregation logic, just assembling the right view
 * for the actor's role.
 */
export async function resolvePerformanceDashboard(authContext: AuthContext): Promise<PerformanceDashboardData> {
  const organizationId = authContext.organization.id;
  const role = authContext.membership.role;
  const companyGoalStatus = await resolveCompanyMonthlyGoalStatus(organizationId);

  if (!MANAGER_ROLES.includes(role)) {
    const personalGoalStatus = await resolveRepGoalAchievement(organizationId, authContext.user.id);
    return { scope: "SELF", companyGoalStatus, personalGoalStatus };
  }

  const [repUserIds, teamGoalStatus, members] = await Promise.all([
    listDistinctPersonGoalOwners({ organizationId }),
    resolveTeamGoalAchievement(organizationId),
    listActiveNotificationRecipientRecords(organizationId),
  ]);
  const nameById = new Map(members.map((member) => [member.userId, member.fullName ?? "İsimsiz"]));

  const repRows = await Promise.all(repUserIds.map(async (userId): Promise<RepPerformanceRow | null> => {
    const goalStatus = await resolveRepGoalAchievement(organizationId, userId);
    return goalStatus ? { userId, fullName: nameById.get(userId) ?? "İsimsiz", goalStatus } : null;
  }));
  const reps = repRows.filter((row): row is RepPerformanceRow => row !== null);

  return { scope: "MANAGER", companyGoalStatus, teamGoalStatus, reps };
}
