import { MemberStatus, type OrganizationRole } from "@prisma/client";
import { prisma } from "@/lib/core/shared/prisma";
import type { OrganizationMemberView } from "./organization-member.types";

const selectMember = {
  id: true, role: true, status: true, joinedAt: true,
  user: { select: { phone: true, fullName: true } },
} as const;

function view(member: { id: string; role: OrganizationRole; status: MemberStatus; joinedAt: Date; user: { phone: string; fullName: string | null } }): OrganizationMemberView {
  return { id: member.id, email: member.user.phone, fullName: member.user.fullName, role: member.role, status: member.status, joinedAt: member.joinedAt };
}

export async function listOrganizationMemberRecords(organizationId: string): Promise<OrganizationMemberView[]> {
  const rows = await prisma.organizationMember.findMany({
    where: { organizationId }, select: selectMember, orderBy: [{ status: "asc" }, { joinedAt: "asc" }],
  });
  return rows.map(view);
}

export async function listActiveNotificationRecipientRecords(organizationId: string) {
  return prisma.organizationMember.findMany({
    where: { organizationId, status: MemberStatus.ACTIVE },
    select: { userId: true, role: true, user: { select: { fullName: true } } },
    orderBy: { joinedAt: "asc" },
  }).then((rows) => rows.map((row) => ({ userId: row.userId, fullName: row.user.fullName, role: row.role })));
}

export async function createInvitedMemberRecord(input: { organizationId: string; email: string; role: OrganizationRole }): Promise<OrganizationMemberView> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { phone: input.email },
      create: { phone: input.email, email: input.email },
      update: { email: input.email },
    });
    const member = await tx.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: input.organizationId, userId: user.id } },
      create: { organizationId: input.organizationId, userId: user.id, role: input.role, status: MemberStatus.INVITED },
      update: { role: input.role, status: MemberStatus.INVITED },
      select: selectMember,
    });
    return view(member);
  });
}

export async function updateOrganizationMemberRecord(input: { organizationId: string; memberId: string; role?: OrganizationRole; status?: MemberStatus }): Promise<OrganizationMemberView | null> {
  const existing = await prisma.organizationMember.findFirst({ where: { id: input.memberId, organizationId: input.organizationId }, select: { id: true } });
  if (!existing) return null;
  const member = await prisma.organizationMember.update({
    where: { id: input.memberId, organizationId: input.organizationId },
    data: { role: input.role, status: input.status }, select: selectMember,
  });
  return view(member);
}

/**
 * Bir user'ın kendi organizasyon içindeki membership id'sini bulur.
 * manageOrganizationMember'ın self-disable guard'ı (actorMemberId ===
 * memberId) için gereklidir — ExecutionContext yalnızca actorId (User.id)
 * taşır, membership id taşımaz (bkz. gateway/execution-context.ts).
 */
export async function findMembershipIdForUser(organizationId: string, userId: string): Promise<string | null> {
  const member = await prisma.organizationMember.findFirst({ where: { organizationId, userId }, select: { id: true } });
  return member?.id ?? null;
}
