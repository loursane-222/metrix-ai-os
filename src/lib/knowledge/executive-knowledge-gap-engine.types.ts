// ─── Executive Knowledge Gap Engine V1 — Type Definitions ────────────────────
//
// Prisma import yok. DB bağımlılığı yok. Saf tip tanımlarıdır.

import type { KnowledgeGapScore } from "./executive-knowledge-registry.types";

export type { KnowledgeGapScore };

export type KnowledgeGapEngineInput = {
  activeMemoryKeys: string[];      // DB'den caller tarafından getirilir
  industryValue?: string;          // memory'deki "industry" değeri
  businessModelValue?: string;     // memory'deki "business_model" değeri
};

export type GapTier = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type PrioritizedGapItem = {
  key: string;
  label: string;
  tier: GapTier;
  suggestedQuestion: string;
  reason: string;
};

export type KnowledgeGapEngineResult = {
  gapScore: KnowledgeGapScore;
  prioritizedGaps: PrioritizedGapItem[];
  topGaps: PrioritizedGapItem[];   // ilk 3 kritik gap
  isBlind: boolean;                // overallReadiness === "BLIND"
};
