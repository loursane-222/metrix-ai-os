import type { MemberStatus, OrganizationRole } from "@prisma/client";

export type OrganizationMemberView = Readonly<{
  id: string;
  email: string;
  fullName: string | null;
  role: OrganizationRole;
  status: MemberStatus;
  joinedAt: Date;
}>;
