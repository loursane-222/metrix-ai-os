import type { JsonInputRootValue } from "@/lib/api/validation";

export type OnboardingAnswers = {
  industry?: string;
  businessType?: string;
  teamStructure?: string;
  teamSize?: string;
  mainChallenge?: string;
  firstGoal?: string;
};

export type RecognitionProfile = {
  industry: string;
  teamSize: string;
  businessType: string;
  priorities: string[];
  risks: string[];
  recommendedFirstSetupStep: string;
  summary: string;
  insight: RecognitionInsight;
};

export type BusinessProfile = {
  answers: OnboardingAnswers;
  updatedAt: string;
};

export type SevenDayPlanItem = {
  phase: string;
  title: string;
  action: string;
};

export type RecognitionInsight = {
  headline: string;
  businessType: string;
  operationalPriority: string;
  mainBottleneck: string;
  recommendedFirstModule: string;
  sevenDayPlan: SevenDayPlanItem[];
  riskWarnings: string[];
  nextBestActions: string[];
  confidence: number;
  generatedBy: "deterministic";
  version: string;
};

export type RecognitionProfileJson = RecognitionProfile & JsonInputRootValue;
export type BusinessProfileJson = BusinessProfile & JsonInputRootValue;
