import type { Organization, OrganizationMember, Session, User } from "@prisma/client";

export type CurrentSessionContext = {
  session: Session;
  user: User;
  trustedDeviceValid: boolean;
};

export type CurrentOrganizationContext = {
  organization: Organization;
  membership: OrganizationMember;
};

export type AuthContext = {
  user: User;
  organization: Organization;
  membership: OrganizationMember;
  session: Session;
};

export type AuthTokens = {
  sessionToken?: string;
  trustedDeviceToken?: string;
};
