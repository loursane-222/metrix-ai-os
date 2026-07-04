// ─── Executive Question Engine V1 — Type Definitions ──────────────────────────
//
// Prisma import yok. DB bağımlılığı yok. Saf tip tanımlarıdır.

import type {
  CuriosityReadinessGrade,
  ExecutiveCuriosity,
  GapTier,
} from "@/lib/executive-curiosity";

export type { CuriosityReadinessGrade, GapTier };

export type ExecutiveQuestionMode = "DIRECT" | "INLINE";

export type ExecutiveQuestion = {
  generatedAt: string;
  targetKey: string;
  targetLabel: string;
  tier: GapTier;
  mode: ExecutiveQuestionMode;
  primaryQuestion: string;
  fallbackQuestion: string;
  urgencySignal: string;
  readinessGrade: CuriosityReadinessGrade;
  shouldAsk: boolean;
};

export type BuildExecutiveQuestionInput = {
  curiosity: ExecutiveCuriosity;
};
