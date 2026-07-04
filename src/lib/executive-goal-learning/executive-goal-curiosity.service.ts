// ─── Executive Goal Curiosity Engine V1 ───────────────────────────────────────
//
// ExecutiveGoalIntelligence → ExecutiveCuriosity.
// ExecutiveQuestion Engine'e doğrudan geçilebilir (aynı tip).
// Prisma yok. DB yok. Async yok. Saf hesaplama.

import type {
  CuriosityReadinessGrade,
  ExecutiveCuriosity,
  LearningTarget,
} from "@/lib/executive-curiosity";
import type { GoalCategoryKey, GoalReadiness } from "@/lib/executive-goal-intelligence";
import type { ExecutiveGoalIntelligence } from "@/lib/executive-goal-intelligence";
import { EXECUTIVE_GOAL_REGISTRY } from "@/lib/executive-goal-intelligence/executive-goal-registry";

export function buildGoalCuriosity(
  goalIntelligence: ExecutiveGoalIntelligence,
): ExecutiveCuriosity {
  const readinessGrade = goalReadinessToGrade(goalIntelligence.readiness);
  const learningQueue = buildGoalLearningQueue(goalIntelligence.criticalMissing);
  const topLearningTarget = learningQueue[0] ?? null;

  return {
    generatedAt: new Date().toISOString(),
    isBlind: goalIntelligence.readiness === "ABSENT",
    isCurious: learningQueue.length > 0,
    topLearningTarget,
    learningQueue,
    readinessGrade,
    completionRatio: goalIntelligence.totalCategories > 0
      ? goalIntelligence.totalPresent / goalIntelligence.totalCategories
      : 0,
    evidence: buildGoalEvidence(goalIntelligence, readinessGrade, topLearningTarget),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function goalReadinessToGrade(readiness: GoalReadiness): CuriosityReadinessGrade {
  switch (readiness) {
    case "ABSENT":  return "F";
    case "MINIMAL": return "D";
    case "PARTIAL": return "C";
    case "STRONG":  return "A";
  }
}

function buildGoalLearningQueue(
  criticalMissing: GoalCategoryKey[],
): LearningTarget[] {
  return criticalMissing.map((categoryKey, index) => {
    const entry = EXECUTIVE_GOAL_REGISTRY.find((e) => e.categoryKey === categoryKey);
    return {
      rank: index + 1,
      key: categoryKey,
      label: entry?.label ?? categoryKey,
      tier: "CRITICAL" as const,
      reason: "Eksik şirket hedefi — hedef bazlı analiz kısıtlı.",
      suggestedQuestion: entry?.suggestedQuestion ?? `${entry?.label ?? categoryKey} nedir?`,
      acquisitionModes: ["CONVERSATION" as const],
    };
  });
}

function buildGoalEvidence(
  goalIntelligence: ExecutiveGoalIntelligence,
  grade: CuriosityReadinessGrade,
  top: LearningTarget | null,
): string[] {
  const lines: string[] = [
    `Hedef tamamlanma durumu: ${goalIntelligence.totalPresent}/${goalIntelligence.totalCategories} (Not: ${grade})`,
  ];

  if (goalIntelligence.criticalMissing.length > 0) {
    const labels = goalIntelligence.criticalMissing
      .map((k) => EXECUTIVE_GOAL_REGISTRY.find((e) => e.categoryKey === k)?.label ?? k)
      .join(", ");
    lines.push(`Eksik kritik hedefler: ${labels}`);
  }

  if (top) {
    lines.push(`Öğrenme önceliği: "${top.label}"`);
  } else {
    lines.push("Tüm kritik hedefler mevcut.");
  }

  return lines;
}
