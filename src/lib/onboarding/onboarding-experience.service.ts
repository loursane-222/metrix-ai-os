import { OrganizationRole } from "@prisma/client";

import { AuthError } from "@/lib/auth/shared/auth.errors";
import { buildActionEngineResult } from "@/lib/actions/action-engine.service";
import { buildGuidedActionResult } from "@/lib/actions/guided-action-engine.service";
import {
  buildBusinessProfile,
  buildRecognitionProfile,
} from "@/lib/recognition/recognition-engine.service";
import { buildRecognitionMapResult } from "@/lib/recognition/recognition-map.service";
import {
  activateOnboardingMemoryCandidates,
  buildOnboardingMemoryCandidates,
  createMissingMemoryCandidates,
} from "@/lib/memory/candidate-engine.service";

import {
  completeOrganizationOnboarding,
  completeUserOnboarding,
  updateOrganizationOnboardingProgress,
} from "./onboarding-experience.repository";
import { buildOnboardingOperatingContext } from "./onboarding-operating-context.service";

import type {
  CompleteOnboardingInput,
  CompleteOnboardingResult,
  OnboardingStatusResult,
  SaveOnboardingInput,
} from "./onboarding-experience.types";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import type { BusinessProfileJson, RecognitionProfileJson } from "@/lib/recognition/recognition-engine.types";

export function assertCanManageOnboarding(context: AuthContext): void {
  if (
    context.membership.role !== OrganizationRole.OWNER &&
    context.membership.role !== OrganizationRole.EXECUTIVE
  ) {
    throw new AuthError("Organization onboarding requires owner access.", 403);
  }
}

export function buildOnboardingStatusResult(
  context: AuthContext,
): OnboardingStatusResult {
  const recognitionProfile =
    context.organization.recognitionProfileJson as RecognitionProfileJson | null;
  const businessProfile =
    context.organization.businessProfileJson as BusinessProfileJson | null;
  const actionEngineResult = buildActionEngineResult(recognitionProfile);

  return {
    onboarding: {
      user: context.user,
      organization: context.organization,
      businessProfile,
    },
    recognitionProfile,
    actionEngineResult,
    guidedActionResult: buildGuidedActionResult({
      recognitionProfile,
      actionEngineResult,
    }),
    recognitionMapResult: buildRecognitionMapResult({
      businessProfile,
      recognitionProfile,
    }),
  };
}

export async function saveOnboardingProgress(
  input: SaveOnboardingInput,
): Promise<OnboardingStatusResult["onboarding"]["organization"]> {
  const businessProfile = buildBusinessProfile(input.answers);
  const recognitionProfile = buildRecognitionProfile(input.answers);

  return updateOrganizationOnboardingProgress({
    organizationId: input.organizationId,
    step: input.step,
    businessProfile,
    recognitionProfile,
  });
}

export async function completeOnboardingExperience(
  input: CompleteOnboardingInput,
): Promise<CompleteOnboardingResult> {
  const businessProfile = buildBusinessProfile(input.answers);
  const recognitionProfile = buildRecognitionProfile(input.answers);
  const memoryCandidates = buildOnboardingMemoryCandidates({
    businessProfile,
    recognitionProfile,
  });

  try {
    await createMissingMemoryCandidates({
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      candidates: memoryCandidates,
    });
  } catch {
    // Candidate creation must not block onboarding completion.
  }

  // Faz 0: Promote onboarding candidates to active MemoryItems.
  let activatedMemoryCount = 0;
  try {
    const activation = await activateOnboardingMemoryCandidates({
      organizationId: input.organizationId,
      systemUserId: input.userId,
    });
    activatedMemoryCount = activation.activatedCount;
  } catch {
    // Memory activation must not block onboarding completion.
  }

  const organization = await completeOrganizationOnboarding({
    organizationId: input.organizationId,
    businessProfile,
    recognitionProfile,
  });
  const user = await completeUserOnboarding(input.userId);

  // Faz 1: Build first Executive Brain assessment from onboarding context.
  let assessment = null;
  try {
    assessment = await buildOnboardingOperatingContext({
      organizationId: input.organizationId,
      businessProfile,
      recognitionProfile,
      discoveryAnalysis: input.discoveryAnalysis ?? null,
    });
  } catch {
    // Assessment must not block onboarding completion.
  }

  return {
    organization,
    user,
    businessProfile,
    recognitionProfile,
    assessment,
    activatedMemoryCount,
  };
}
