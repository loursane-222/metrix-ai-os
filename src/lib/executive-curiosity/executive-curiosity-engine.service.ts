// ─── Executive Curiosity Engine V1 ────────────────────────────────────────────
//
// KnowledgeGapEngineResult → öğrenme önceliği üretir.
// Kullanıcıya soru sormaz. Sadece iç sıralama üretir.
// Prisma import yok. DB çağrısı yok. async yok. Saf hesaplama.

import { getKnowledgeKey } from "@/lib/knowledge/executive-knowledge-registry";

import type {
  BuildExecutiveCuriosityInput,
  CuriosityReadinessGrade,
  ExecutiveCuriosity,
  LearningTarget,
} from "./executive-curiosity-engine.types";

import type { PrioritizedGapItem } from "@/lib/knowledge/executive-knowledge-gap-engine.types";
import type { KnowledgeGapScore } from "@/lib/knowledge/executive-knowledge-registry.types";

const LEARNING_QUEUE_LIMIT = 5;

export function buildExecutiveCuriosity(
  input: BuildExecutiveCuriosityInput,
): ExecutiveCuriosity {
  const { gapEngineResult } = input;
  const { gapScore, prioritizedGaps, isBlind } = gapEngineResult;

  const learningQueue = buildLearningQueue(prioritizedGaps);
  const topLearningTarget = learningQueue[0] ?? null;
  const readinessGrade = computeReadinessGrade(gapScore);
  const evidence = buildEvidence(gapScore, readinessGrade, topLearningTarget);

  return {
    generatedAt: new Date().toISOString(),
    isBlind,
    isCurious: learningQueue.length > 0,
    topLearningTarget,
    learningQueue,
    readinessGrade,
    completionRatio: gapScore.completionRatio,
    evidence,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildLearningQueue(
  prioritizedGaps: PrioritizedGapItem[],
): LearningTarget[] {
  // prioritizedGaps zaten Gap Engine tarafından tier+priority sırasına göre verilir
  const queue: LearningTarget[] = [];

  for (const gap of prioritizedGaps) {
    if (queue.length >= LEARNING_QUEUE_LIMIT) break;

    const entry = getKnowledgeKey(gap.key);
    if (!entry) continue;

    queue.push({
      rank: queue.length + 1,
      key: gap.key,
      label: gap.label,
      tier: gap.tier,
      reason: gap.reason,
      suggestedQuestion: gap.suggestedQuestion,
      acquisitionModes: entry.acquisitionModes,
    });
  }

  return queue;
}

function computeReadinessGrade(
  gapScore: KnowledgeGapScore,
): CuriosityReadinessGrade {
  switch (gapScore.overallReadiness) {
    case "BLIND":        return "F";
    case "INSUFFICIENT": return "D";
    case "PARTIAL":      return "C";
    case "READY":        return "B";
    case "COMPLETE":     return "A";
  }
}

function buildEvidence(
  gapScore: KnowledgeGapScore,
  grade: CuriosityReadinessGrade,
  top: LearningTarget | null,
): string[] {
  const lines: string[] = [];

  lines.push(
    `Bilgi tamamlanma oranı: %${Math.round(gapScore.completionRatio * 100)} (Not: ${grade})`,
  );

  if (gapScore.criticalGaps.length > 0) {
    lines.push(`Kritik eksik (L1): ${gapScore.criticalGaps.join(", ")}`);
  }
  if (gapScore.highGaps.length > 0) {
    lines.push(`Yüksek öncelikli eksik (L2): ${gapScore.highGaps.join(", ")}`);
  }
  if (gapScore.mediumGaps.length > 0) {
    lines.push(`Orta öncelikli eksik (L2): ${gapScore.mediumGaps.join(", ")}`);
  }
  if (top) {
    lines.push(`Öğrenme önceliği: "${top.label}" — ${top.reason}`);
  } else {
    lines.push("Tüm temel bilgiler mevcut. Öğrenilecek kritik bilgi yok.");
  }

  return lines;
}
