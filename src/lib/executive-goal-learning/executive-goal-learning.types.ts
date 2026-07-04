// ─── Executive Goal Learning Engine V1 — Types ────────────────────────────────
//
// Prisma yok. DB yok. Async yok. Saf tip tanımları.

import type { ExecutiveCuriosity } from "@/lib/executive-curiosity";
import type { ExecutiveQuestion } from "@/lib/executive-question";
import type { ConversationOpportunity, ConversationSnapshot } from "@/lib/executive-conversation-opportunity";
import type { ExecutiveGoalIntelligence, GoalCategoryKey } from "@/lib/executive-goal-intelligence";

export type GoalLearningDecision = {
  generatedAt: string;
  curiosity: ExecutiveCuriosity;
  question: ExecutiveQuestion;
  opportunity: ConversationOpportunity;
  shouldAskNow: boolean;
  finalQuestion: string;
  targetCategoryKey: GoalCategoryKey | null;
  // ABSENT=1.0, MINIMAL=0.8, PARTIAL=0.5, STRONG=0.0
  // Goal Learning Value Engine (V1.2) için genişleme noktası
  goalPriorityScore: number;
};

export type BuildGoalLearningDecisionInput = {
  goalIntelligence: ExecutiveGoalIntelligence;
  snapshot: ConversationSnapshot;
};
