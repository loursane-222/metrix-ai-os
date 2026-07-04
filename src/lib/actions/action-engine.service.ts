import type { RecognitionProfile } from "@/lib/recognition/recognition-engine.types";

import type {
  ActionEngineResult,
  ActionRecommendation,
  ActionType,
} from "./action-engine.types";

const ACTION_ENGINE_VERSION = "1.0.0";

export function buildActionEngineResult(
  recognitionProfile: RecognitionProfile | null,
): ActionEngineResult | null {
  if (!recognitionProfile) {
    return null;
  }

  const insight = recognitionProfile.insight;
  const actions = [
    buildSetupAction(recognitionProfile),
    buildCreateTrackingAction(recognitionProfile),
    buildReviewRisksAction(recognitionProfile),
    buildConfigureRhythmAction(recognitionProfile),
  ]
    .map(scoreAction)
    .sort((left, right) => right.priorityScore - left.priorityScore);

  return {
    topAction: actions[0],
    recommendedActions: actions,
    generatedBy: insight?.generatedBy ?? "deterministic",
    version: ACTION_ENGINE_VERSION,
  };
}

function buildSetupAction(
  profile: RecognitionProfile,
): Omit<ActionRecommendation, "priorityScore"> {
  return buildAction({
    id: "setup-first-module",
    title: `${profile.insight.recommendedFirstModule} kurulumunu başlat`,
    reason: `${profile.insight.mainBottleneck} darboğazını azaltmak için ilk modülü netleştir.`,
    category: "Kurulum",
    module: profile.insight.recommendedFirstModule,
    actionType: "SETUP",
    impactScore: 9,
    urgencyScore: 8,
    effortScore: 4,
    estimatedMinutes: 25,
  });
}

function buildCreateTrackingAction(
  profile: RecognitionProfile,
): Omit<ActionRecommendation, "priorityScore"> {
  return buildAction({
    id: "create-weekly-tracking",
    title: "Haftalık takip maddelerini oluştur",
    reason: `${profile.insight.operationalPriority} hedefini ölçülebilir bir çalışma ritmine çevir.`,
    category: "Takip",
    module: "Haftalık takip",
    actionType: "CREATE",
    impactScore: 8,
    urgencyScore: 8,
    effortScore: 3,
    estimatedMinutes: 20,
  });
}

function buildReviewRisksAction(
  profile: RecognitionProfile,
): Omit<ActionRecommendation, "priorityScore"> {
  const primaryRisk =
    profile.insight.riskWarnings[0] ?? "Önceliklerin tek yerde görünmemesi";

  return buildAction({
    id: "review-primary-risk",
    title: "İlk risk uyarılarını gözden geçir",
    reason: primaryRisk,
    category: "Risk",
    module: "Recognition",
    actionType: "REVIEW",
    impactScore: 7,
    urgencyScore: 6,
    effortScore: 2,
    estimatedMinutes: 10,
  });
}

function buildConfigureRhythmAction(
  profile: RecognitionProfile,
): Omit<ActionRecommendation, "priorityScore"> {
  return buildAction({
    id: "configure-operating-rhythm",
    title: "Çalışma ritmini ayarla",
    reason: `${profile.insight.businessType} için haftalık kontrol ve karar akışını başlat.`,
    category: "Ritim",
    module: "Operasyon ritmi",
    actionType: "CONFIGURE",
    impactScore: 7,
    urgencyScore: 7,
    effortScore: 5,
    estimatedMinutes: 30,
  });
}

function buildAction(
  input: Omit<ActionRecommendation, "priorityScore">,
): Omit<ActionRecommendation, "priorityScore"> {
  return input;
}

function scoreAction(
  action: Omit<ActionRecommendation, "priorityScore">,
): ActionRecommendation {
  return {
    ...action,
    priorityScore: calculatePriorityScore(action),
  };
}

function calculatePriorityScore(input: {
  impactScore: number;
  urgencyScore: number;
  effortScore: number;
}): number {
  const score =
    input.impactScore * 0.5 +
    input.urgencyScore * 0.4 +
    (10 - input.effortScore) * 0.1;

  return Math.round(score * 10) / 10;
}
