import type { Organization, OrganizationMember } from "@prisma/client";

export type CreateOrganizationInput = {
  name: string;
  industry?: string | null;
  companySize?: string | null;
  country?: string | null;
  city?: string | null;
  description?: string | null;
};

export type CreateOrganizationWithOwnerInput = {
  userId: string;
  organizationName: string;
  industry?: string | null;
  companySize?: string | null;
  country?: string | null;
  city?: string | null;
  description?: string | null;
};

export type CreateOwnerMembershipInput = {
  organizationId: string;
  userId: string;
};

export type OrganizationWithOwnerResult = {
  organization: Organization;
  membership: OrganizationMember;
};

export type OrganizationResult = Organization;

export type OrganizationMemberResult = OrganizationMember;
