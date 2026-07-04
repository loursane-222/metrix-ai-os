import type { Organization, User } from "@prisma/client";

import type {
  BusinessProfileJson,
  OnboardingAnswers,
  RecognitionProfileJson,
} from "@/lib/recognition/recognition-engine.types";
import type { ActionEngineResult } from "@/lib/actions/action-engine.types";
import type { GuidedActionResult } from "@/lib/actions/guided-action-engine.types";
import type { RecognitionMapResult } from "@/lib/recognition/recognition-map.types";
import type {
  OnboardingDiscoveryAnalysisInput,
  OnboardingExecutiveAssessment,
} from "./onboarding-operating-context.types";

export type SaveOnboardingInput = {
  organizationId: string;
  userId: string;
  answers: OnboardingAnswers;
  step: string;
};

export type CompleteOnboardingInput = {
  organizationId: string;
  userId: string;
  answers: OnboardingAnswers;
  discoveryAnalysis?: OnboardingDiscoveryAnalysisInput | null;
};

export type CompleteOnboardingResult = {
  organization: Organization;
  user: User;
  businessProfile: BusinessProfileJson;
  recognitionProfile: RecognitionProfileJson;
  assessment: OnboardingExecutiveAssessment | null;
  activatedMemoryCount: number;
};

export type OnboardingStatusResult = {
  onboarding: {
    user: User;
    organization: Organization;
    businessProfile: BusinessProfileJson | null;
  };
  recognitionProfile: RecognitionProfileJson | null;
  actionEngineResult: ActionEngineResult | null;
  guidedActionResult: GuidedActionResult | null;
  recognitionMapResult: RecognitionMapResult | null;
};
