import type { OrganizationRole } from "@prisma/client";
import { inviteOrganizationMember } from "@/lib/core/organization-members/organization-member.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, ActionHandler, HandlerResult } from "../../execution";

const ROLES = ["OWNER", "EXECUTIVE", "MANAGER", "TEAM_LEAD", "EMPLOYEE"] as const;

function extractStructuralInput(input: Record<string, unknown>): { email: string; role: OrganizationRole } {
  const { email, role } = input;
  const reasons: string[] = [];
  if (typeof email !== "string" || !email.trim()) reasons.push("email is required.");
  if (typeof role !== "string" || !ROLES.includes(role as (typeof ROLES)[number])) reasons.push("role must be a valid OrganizationRole.");
  if (reasons.length > 0) throw new Error(reasons.join(" "));
  return { email: email as string, role: role as OrganizationRole };
}

/**
 * organization_member.create için gerçek Domain Action handler'ı.
 *
 * POST /api/organization-members ile aynı canonical service'i
 * (inviteOrganizationMember) sarar — repository/Prisma'yı doğrudan
 * çağırmaz, aynı email normalizasyonu/validasyonunu korur.
 */
export const organizationMemberCreateHandler: ActionHandler = async (
  envelope: ActionExecutionEnvelope,
): Promise<HandlerResult> => {
  const { email, role } = extractStructuralInput(envelope.input);
  const organizationId = envelope.executionContext.organizationId;
  const actorUserId = envelope.executionContext.actorId;

  const member = await inviteOrganizationMember({ organizationId, email, role });

  await notifyWithOwnerFanout({
    organizationId, actorUserId, type: "organization_member.invited",
    title: "Yeni ekip üyesi davet edildi", body: member.email,
    entityType: "OrganizationMember", entityId: member.id,
  });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "organization_member", entityId: member.id },
    resultSummary: `organization_member.create invited ${member.email}.`,
    metadata: { role: member.role, status: member.status },
    domainEvents: [],
    sideEffects: [],
  };
};
