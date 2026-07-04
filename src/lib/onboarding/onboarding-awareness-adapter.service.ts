import type { BuildExecutiveAwarenessInput } from "@/lib/executive-awareness";
import type {
  BusinessProfileJson,
  RecognitionProfileJson,
} from "@/lib/recognition/recognition-engine.types";
import type {
  OnboardingDiscoveryAnalysisInput,
  OnboardingDiscoverySignal,
  OnboardingGoalSignal,
  OnboardingRiskSignal,
} from "./onboarding-operating-context.types";

export const ONBOARDING_MISSING_STEPS = [
  "paymentContext",
  "quoteContext",
  "collectionActionContext",
  "executiveForecast",
  "executiveAlerts",
  "executiveScorecard",
  "executiveRhythm",
  "signalTrendContext",
  "latestBriefing",
  "executiveDecisionContext",
] as const;

export function buildOnboardingRiskSignals(
  recognitionProfile: RecognitionProfileJson,
): OnboardingRiskSignal[] {
  const signals: OnboardingRiskSignal[] = [];

  for (const risk of recognitionProfile.risks) {
    if (!risk?.trim()) continue;
    signals.push({
      key: "recognition_risk",
      value: risk,
      source: "RECOGNITION",
      confidence: 0.6,
    });
  }

  if (recognitionProfile.insight.mainBottleneck?.trim()) {
    signals.push({
      key: "main_bottleneck",
      value: recognitionProfile.insight.mainBottleneck,
      source: "RECOGNITION",
      confidence: 0.65,
    });
  }

  return signals;
}

export function buildOnboardingGoalSignals(
  businessProfile: BusinessProfileJson,
  recognitionProfile: RecognitionProfileJson,
): OnboardingGoalSignal[] {
  const signals: OnboardingGoalSignal[] = [];

  if (businessProfile.answers.firstGoal?.trim()) {
    signals.push({
      key: "first_goal",
      value: businessProfile.answers.firstGoal,
      source: "ONBOARDING_ANSWERS",
      confidence: 0.9,
    });
  }

  if (recognitionProfile.insight.operationalPriority?.trim()) {
    signals.push({
      key: "operational_priority",
      value: recognitionProfile.insight.operationalPriority,
      source: "RECOGNITION",
      confidence: 0.65,
    });
  }

  return signals;
}

export function buildOnboardingDiscoverySignal(
  analysis: OnboardingDiscoveryAnalysisInput | null | undefined,
): OnboardingDiscoverySignal | null {
  if (!analysis) return null;

  return {
    firstImpression: analysis.firstImpression,
    focusItems: analysis.focusItems,
    reason: analysis.reason ?? null,
    caveat: analysis.caveat ?? null,
    expectedOutcome: analysis.expectedOutcome ?? null,
    source: analysis.source,
  };
}

export function buildOnboardingAwarenessInput(
  organizationId: string,
): BuildExecutiveAwarenessInput {
  return {
    organizationId,
    executiveForecast: null,
    executiveAlerts: null,
    signalTrendContext: null,
    executiveDecisionContext: null,
    executiveRhythm: null,
    paymentIntelligence: null,
    quoteIntelligence: null,
    collectionActionContext: null,
    failedSteps: [...ONBOARDING_MISSING_STEPS],
  };
}
