import { OnboardingStatus } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";
import type { BusinessProfileJson, RecognitionProfileJson } from "@/lib/recognition/recognition-engine.types";

export async function updateOrganizationOnboardingProgress(input: {
  organizationId: string;
  step: string;
  businessProfile: BusinessProfileJson;
  recognitionProfile: RecognitionProfileJson;
}) {
  return prisma.organization.update({
    where: {
      id: input.organizationId,
    },
    data: {
      onboardingStatus: OnboardingStatus.IN_PROGRESS,
      onboardingStep: input.step,
      businessProfileJson: input.businessProfile,
      recognitionProfileJson: input.recognitionProfile,
    },
  });
}

export async function completeOrganizationOnboarding(input: {
  organizationId: string;
  businessProfile: BusinessProfileJson;
  recognitionProfile: RecognitionProfileJson;
}) {
  return prisma.organization.update({
    where: {
      id: input.organizationId,
    },
    data: {
      onboardingStatus: OnboardingStatus.COMPLETED,
      onboardingStep: "COMPLETED",
      businessProfileJson: input.businessProfile,
      recognitionProfileJson: input.recognitionProfile,
      onboardingCompletedAt: new Date(),
    },
  });
}

export async function completeUserOnboarding(userId: string) {
  return prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      onboardingStatus: OnboardingStatus.COMPLETED,
      onboardingStep: "COMPLETED",
      onboardingCompletedAt: new Date(),
    },
  });
}
