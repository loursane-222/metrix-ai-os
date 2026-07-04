import type { ExecutiveAwareness } from "@/lib/executive-awareness";
import type { ExecutiveNarrative } from "@/lib/executive-narrative";
import type {
  ExecutiveFocus,
  ExecutiveFocusArea,
  ExecutiveFocusConfidence,
} from "@/lib/executive-focus";
import type { ExecutiveGoalIntelligence } from "@/lib/executive-goal-intelligence";
import type { MemoryContext } from "@/lib/memory/memory-context.types";
import type {
  BusinessProfileJson,
  RecognitionProfileJson,
} from "@/lib/recognition/recognition-engine.types";

export type OnboardingSignalSource =
  | "RECOGNITION"
  | "ONBOARDING_ANSWERS"
  | "EXECUTIVE_DISCOVERY"
  | "VOICE_DISCOVERY";

export type OnboardingRiskSignal = {
  key: string;
  value: string;
  source: OnboardingSignalSource;
  confidence: number;
};

export type OnboardingGoalSignal = {
  key: string;
  value: string;
  source: OnboardingSignalSource;
  confidence: number;
};

export type OnboardingDiscoverySignal = {
  firstImpression: string;
  focusItems: string[];
  reason: string | null;
  caveat: string | null;
  expectedOutcome: string | null;
  source: "EXECUTIVE_DISCOVERY" | "VOICE_DISCOVERY";
};

export type FirstExecutiveDecision = {
  category: ExecutiveFocusArea;
  title: string;
  rationale: string;
  firstAction: string;
  supportingActions: string[];
  confidence: ExecutiveFocusConfidence;
  isFallback: boolean;
};

export type OnboardingExecutiveAssessment = {
  generatedAt: string;
  onboardingMode: true;
  organizationId: string;
  confidence: "LOW";
  awareness: ExecutiveAwareness;
  narrative: ExecutiveNarrative;
  focus: ExecutiveFocus;
  goalIntelligence: ExecutiveGoalIntelligence;
  memoryContext: MemoryContext;
  riskSignals: OnboardingRiskSignal[];
  goalSignals: OnboardingGoalSignal[];
  discoverySignal: OnboardingDiscoverySignal | null;
  firstExecutiveDecision: FirstExecutiveDecision | null;
  activatedMemoryCount: number;
  missingDataSteps: string[];
};

export type OnboardingDiscoveryAnalysisInput = {
  firstImpression: string;
  reason?: string | null;
  caveat?: string | null;
  focusItems: string[];
  expectedOutcome?: string | null;
  source: "EXECUTIVE_DISCOVERY" | "VOICE_DISCOVERY";
};

export type BuildOnboardingOperatingContextInput = {
  organizationId: string;
  businessProfile: BusinessProfileJson;
  recognitionProfile: RecognitionProfileJson;
  discoveryAnalysis?: OnboardingDiscoveryAnalysisInput | null;
};
