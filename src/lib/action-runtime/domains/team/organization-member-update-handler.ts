import type { OrganizationRole } from "@prisma/client";
import { getOwnMembershipId, listOrganizationMembers, manageOrganizationMember } from "@/lib/core/organization-members/organization-member.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, ActionHandler, HandlerResult } from "../../execution";

const ROLES = ["OWNER", "EXECUTIVE", "MANAGER", "TEAM_LEAD", "EMPLOYEE"] as const;

function extractStructuralInput(input: Record<string, unknown>): { memberId: string; role?: OrganizationRole; disabled?: boolean } {
  const { memberId, role, disabled } = input;
  const reasons: string[] = [];
  if (typeof memberId !== "string" || !memberId.trim()) reasons.push("memberId is required.");
  if (role !== undefined && !ROLES.includes(role as (typeof ROLES)[number])) reasons.push("role must be a valid OrganizationRole.");
  if (disabled !== undefined && typeof disabled !== "boolean") reasons.push("disabled must be a boolean.");
  if (role === undefined && disabled === undefined) reasons.push("At least one of role or disabled is required.");
  if (reasons.length > 0) throw new Error(reasons.join(" "));
  return { memberId: memberId as string, role: role as OrganizationRole | undefined, disabled: disabled as boolean | undefined };
}

/**
 * organization_member.update için gerçek Domain Action handler'ı.
 *
 * PATCH /api/organization-members/[memberId] ile aynı canonical service'i
 * (manageOrganizationMember) sarar — repository/Prisma'yı doğrudan
 * çağırmaz, aynı "kendi üyeliğini disable edemez" iş kuralını korur.
 * actorMemberId'yi ExecutionContext taşımadığı için (yalnızca actorId/
 * User.id taşır) tek ek adım: aktörün kendi membership id'sini
 * getOwnMembershipId ile çözmek — bu da mevcut service'e eklenmiş küçük,
 * salt-okunur bir lookup'tır, yeni iş mantığı değildir.
 */
export const organizationMemberUpdateHandler: ActionHandler = async (
  envelope: ActionExecutionEnvelope,
): Promise<HandlerResult> => {
  const { memberId, role, disabled } = extractStructuralInput(envelope.input);
  const organizationId = envelope.executionContext.organizationId;
  const actorUserId = envelope.executionContext.actorId;

  const actorMemberId = await getOwnMembershipId(organizationId, actorUserId);
  if (!actorMemberId) throw new Error("Acting member not found in this organization.");

  const before = (await listOrganizationMembers(organizationId)).find((candidate) => candidate.id === memberId);
  if (!before) throw new Error("Member not found.");

  const member = await manageOrganizationMember({ organizationId, memberId, actorMemberId, role, disabled });

  const entityRef = { entityType: "organization_member", entityId: memberId };
  const changedFields = [...(role !== undefined ? ["role"] : []), ...(disabled !== undefined ? ["status"] : [])];

  await notifyWithOwnerFanout({
    organizationId, actorUserId, type: "organization_member.updated",
    title: "Ekip üyesi güncellendi", body: member.fullName ?? member.email,
    entityType: "OrganizationMember", entityId: memberId,
  });

  return {
    status: "SUCCESS",
    entityRef,
    resultSummary: `organization_member.update applied to ${changedFields.length} field(s).`,
    metadata: { changedFields, role: member.role, status: member.status },
    domainEvents: [],
    sideEffects: [],
    compensationSnapshot: {
      memberId,
      ...(role !== undefined ? { role: before.role } : {}),
      ...(disabled !== undefined ? { disabled: before.status === "DISABLED" } : {}),
    },
  };
};
