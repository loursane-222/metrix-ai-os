import { startOnboardingConversation } from "@/lib/core/conversations/conversation.service";
import { createOrganizationWithOwner } from "@/lib/core/organizations/organization.service";
import { prisma } from "@/lib/core/shared/prisma";

import type {
  StartOrganizationOnboardingInput,
  StartOrganizationOnboardingResult,
} from "./onboarding.types";

export async function startOrganizationOnboarding(
  input: StartOrganizationOnboardingInput,
): Promise<StartOrganizationOnboardingResult> {
  return prisma.$transaction(async (tx) => {
    const { organization, membership } = await createOrganizationWithOwner(
      {
        userId: input.userId,
        organizationName: input.organizationName,
        industry: input.industry,
        companySize: input.companySize,
        country: input.country,
        city: input.city,
        description: input.description,
      },
      tx,
    );

    const conversation = await startOnboardingConversation(
      {
        organizationId: organization.id,
        actorUserId: input.userId,
        title: `${organization.name} Onboarding`,
      },
      tx,
    );

    return {
      organization,
      membership,
      conversation,
    };
  });
}
