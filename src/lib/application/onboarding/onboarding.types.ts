import type { ConversationResult } from "@/lib/core/conversations/conversation.types";
import type { OrganizationWithOwnerResult } from "@/lib/core/organizations/organization.types";

export type StartOrganizationOnboardingInput = {
  userId: string;
  organizationName: string;
  industry?: string | null;
  companySize?: string | null;
  country?: string | null;
  city?: string | null;
  description?: string | null;
};

export type StartOrganizationOnboardingResult = OrganizationWithOwnerResult & {
  conversation: ConversationResult;
};
