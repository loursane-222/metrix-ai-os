import type { OrganizationRole } from "@prisma/client";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { listActiveNotificationRecipientRecords } from "@/lib/core/organization-members/organization-member.repository";
import { parseRepGoalReport } from "./rep-goal-report-parser.service";
import { upsertPersonMonthlyGoal } from "./rep-goal.repository";

// Same set as field-visit-weekly-summary-request.service.ts's colleague/team
// view gate — setting a rep's goal is a managerial action, same tier.
const MANAGER_ROLES: readonly OrganizationRole[] = ["TEAM_LEAD", "MANAGER", "EXECUTIVE", "OWNER"];

const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9@+]/g, "");
const SELF_KEYWORDS = ["ben", "benim", "kendim", "kendi"];

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

  const target = await resolveTargetRep(input.authContext, extraction.repNameRaw);
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
