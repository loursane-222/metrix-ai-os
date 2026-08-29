import type { OrganizationRole } from "@prisma/client";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { resolveRepByName } from "@/lib/core/organization-members/member-name-resolution";
import { parseRepGoalReport } from "./rep-goal-report-parser.service";
import { upsertPersonMonthlyGoal } from "./rep-goal.repository";

// Same set as field-visit-weekly-summary-request.service.ts's colleague/team
// view gate — setting a rep's goal is a managerial action, same tier.
const MANAGER_ROLES: readonly OrganizationRole[] = ["TEAM_LEAD", "MANAGER", "EXECUTIVE", "OWNER"];

export type RepGoalCreateOutcome =
  | Readonly<{ status: "PARSE_FAILED" }>
  | Readonly<{ status: "DENIED" }>
  | Readonly<{ status: "REP_NOT_FOUND" }>
  | Readonly<{ status: "REP_AMBIGUOUS"; options: readonly string[] }>
  | Readonly<{
      status: "SET";
      repFullName: string;
      visitTargetSet: boolean;
      salesTargetSet: boolean;
      collectionTargetSet: boolean;
    }>;

export async function processRepGoalReport(input: { authContext: AuthContext; message: string }): Promise<RepGoalCreateOutcome> {
  const organizationId = input.authContext.organization.id;
  const actorRole = input.authContext.membership.role;
  if (!MANAGER_ROLES.includes(actorRole)) return { status: "DENIED" };

  const extraction = await parseRepGoalReport({ message: input.message });
  if (!extraction) return { status: "PARSE_FAILED" };

  const target = await resolveRepByName(input.authContext, extraction.repNameRaw);
  if (target.status !== "RESOLVED") return target;

  const title = `${target.fullName} — Aylık Hedef`;
  if (extraction.visitTarget !== null) {
    await upsertPersonMonthlyGoal({ organizationId, ownerUserId: target.userId, goalType: "ACTIVITY", title, amount: extraction.visitTarget });
  }
  if (extraction.salesTarget !== null) {
    await upsertPersonMonthlyGoal({ organizationId, ownerUserId: target.userId, goalType: "SALES", title, amount: extraction.salesTarget });
  }
  if (extraction.collectionTarget !== null) {
    await upsertPersonMonthlyGoal({ organizationId, ownerUserId: target.userId, goalType: "COLLECTION", title, amount: extraction.collectionTarget });
  }

  return {
    status: "SET",
    repFullName: target.fullName,
    visitTargetSet: extraction.visitTarget !== null,
    salesTargetSet: extraction.salesTarget !== null,
    collectionTargetSet: extraction.collectionTarget !== null,
  };
}
