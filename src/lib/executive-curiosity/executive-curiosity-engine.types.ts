// ─── Executive Curiosity Engine V1 — Type Definitions ─────────────────────────
//
// Prisma import yok. DB bağımlılığı yok. Saf tip tanımlarıdır.

import type { GapTier, KnowledgeGapEngineResult } from "@/lib/knowledge/executive-knowledge-gap-engine.types";
import type { AcquisitionMode } from "@/lib/knowledge/executive-knowledge-registry.types";

export type { GapTier };

// A = COMPLETE, B = READY, C = PARTIAL, D = INSUFFICIENT, F = BLIND
export type CuriosityReadinessGrade = "A" | "B" | "C" | "D" | "F";

export type LearningTarget = {
  rank: number;                   // 1 = en yüksek öncelik
  key: string;
  label: string;
  tier: GapTier;
  reason: string;
  suggestedQuestion: string;
  acquisitionModes: AcquisitionMode[];
};

export type ExecutiveCuriosity = {
  generatedAt: string;
  isBlind: boolean;                           // L1'in yarısı eksik → kritik durum
  isCurious: boolean;                         // öğrenilecek en az 1 şey var mı
  topLearningTarget: LearningTarget | null;   // #1 öncelikli
  learningQueue: LearningTarget[];            // top 5 sıralı liste
  readinessGrade: CuriosityReadinessGrade;
  completionRatio: number;                    // 0.0 – 1.0
  evidence: string[];
};

export type BuildExecutiveCuriosityInput = {
  // Ana yol: Gap Engine sonucu doğrudan verilirse memoryContext'e gerek yok
  gapEngineResult: KnowledgeGapEngineResult;
};
