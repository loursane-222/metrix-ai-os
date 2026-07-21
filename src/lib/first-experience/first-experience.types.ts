import type { OnboardingStatus, OrganizationRole } from "@prisma/client";

export const FIRST_EXPERIENCE_WELCOME_DELIVERED = "FIRST_EXPERIENCE_WELCOME_DELIVERED";
export const FIRST_EXPERIENCE_ACTIVE = "FIRST_EXPERIENCE_ACTIVE";
export const FIRST_EXPERIENCE_MESSAGE_KIND = "first_experience_welcome";

export type FirstExperienceState = {
  organizationStatus: OnboardingStatus;
  organizationStep: string | null;
  membershipRole: OrganizationRole;
};

export type FirstExperienceOpeningPlan = {
  title: string;
  content: string;
  metadata: { kind: typeof FIRST_EXPERIENCE_MESSAGE_KIND; version: 1 };
};

export type FirstExperienceBootstrap = {
  active: boolean;
  conversationId: string | null;
  messages: Array<{ role: "metrix" | "user"; content: string }>;
};
