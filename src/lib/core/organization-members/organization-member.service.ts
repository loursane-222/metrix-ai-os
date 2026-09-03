import { MemberStatus, type OrganizationRole } from "@prisma/client";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { createInvitedMemberRecord, findMembershipIdForUser, listOrganizationMemberRecords, updateOrganizationMemberRecord } from "./organization-member.repository";

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new AuthError("Geçerli bir e-posta adresi girin.", 400);
  return email;
}

export const listOrganizationMembers = listOrganizationMemberRecords;
export function inviteOrganizationMember(input: { organizationId: string; email: string; role: OrganizationRole }) {
  return createInvitedMemberRecord({ ...input, email: normalizeEmail(input.email) });
}
export async function manageOrganizationMember(input: { organizationId: string; memberId: string; actorMemberId: string; role?: OrganizationRole; disabled?: boolean }) {
  if (input.memberId === input.actorMemberId && input.disabled) throw new AuthError("Kendi üyeliğinizi devre dışı bırakamazsınız.", 400);
  const member = await updateOrganizationMemberRecord({
    organizationId: input.organizationId, memberId: input.memberId, role: input.role,
    status: input.disabled === undefined ? undefined : input.disabled ? MemberStatus.DISABLED : MemberStatus.ACTIVE,
  });
  if (!member) throw new AuthError("Üye bulunamadı.", 404);
  return member;
}

export function getOwnMembershipId(organizationId: string, userId: string): Promise<string | null> {
  return findMembershipIdForUser(organizationId, userId);
}
