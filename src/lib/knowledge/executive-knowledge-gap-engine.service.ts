// ─── Executive Knowledge Gap Engine V1 ───────────────────────────────────────
//
// computeKnowledgeGapScore() çıktısını yorumlar ve önceliklendirir.
// Prisma import yok. DB çağrısı yok. Saf hesaplama.

import {
  computeKnowledgeGapScore,
  getKnowledgeKey,
} from "./executive-knowledge-registry";

import type {
  GapTier,
  KnowledgeGapEngineInput,
  KnowledgeGapEngineResult,
  PrioritizedGapItem,
} from "./executive-knowledge-gap-engine.types";

import type { KnowledgePriority } from "./executive-knowledge-registry.types";

const TIER_ORDER: Record<GapTier, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const PRIORITY_ORDER: Record<KnowledgePriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

export function detectKnowledgeGaps(
  input: KnowledgeGapEngineInput,
): KnowledgeGapEngineResult {
  const gapScore = computeKnowledgeGapScore({
    activeMemoryKeys: input.activeMemoryKeys,
    industryValue: input.industryValue,
    businessModelValue: input.businessModelValue,
  });

  const rawGroups: Array<{ keys: string[]; tier: GapTier }> = [
    { keys: gapScore.criticalGaps, tier: "CRITICAL" },
    { keys: gapScore.highGaps,     tier: "HIGH" },
    { keys: gapScore.mediumGaps,   tier: "MEDIUM" },
    { keys: gapScore.lowGaps,      tier: "LOW" },
  ];

  const items: PrioritizedGapItem[] = [];

  for (const { keys, tier } of rawGroups) {
    for (const key of keys) {
      const entry = getKnowledgeKey(key);
      if (!entry) continue;

      items.push({
        key: entry.key,
        label: entry.label,
        tier,
        suggestedQuestion: entry.suggestedQuestion,
        reason: entry.reason,
      });
    }
  }

  const prioritizedGaps = items.sort((a, b) => {
    const tierDiff = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    if (tierDiff !== 0) return tierDiff;

    const aEntry = getKnowledgeKey(a.key);
    const bEntry = getKnowledgeKey(b.key);
    const aPriority = aEntry ? PRIORITY_ORDER[aEntry.priority] : 2;
    const bPriority = bEntry ? PRIORITY_ORDER[bEntry.priority] : 2;
    return aPriority - bPriority;
  });

  return {
    gapScore,
    prioritizedGaps,
    topGaps: prioritizedGaps.slice(0, 3),
    isBlind: gapScore.overallReadiness === "BLIND",
  };
}
