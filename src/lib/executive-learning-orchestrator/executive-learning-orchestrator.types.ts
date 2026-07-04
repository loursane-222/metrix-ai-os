// ─── Executive Learning Orchestrator V1 — Type Definitions ───────────────────
//
// Prisma import yok. DB bağımlılığı yok. Saf tip tanımlarıdır.

import type { KnowledgeGapEngineResult } from "@/lib/knowledge/executive-knowledge-gap-engine.types";
import type { ExecutiveCuriosity } from "@/lib/executive-curiosity";
import type { ExecutiveQuestion } from "@/lib/executive-question";
import type {
  ConversationOpportunity,
  ConversationSnapshot,
} from "@/lib/executive-conversation-opportunity";
import type {
  ExecutiveLearningValue,
  LearningValueRecommendation,
} from "@/lib/executive-learning-value";

export type { LearningValueRecommendation };

export type ExecutiveLearningDecision = {
  generatedAt: string;
  curiosity: ExecutiveCuriosity;
  question: ExecutiveQuestion;
  opportunity: ConversationOpportunity;
  value: ExecutiveLearningValue;
  recommendation: LearningValueRecommendation;
  finalQuestion: string;
  shouldAskNow: boolean;
};

export type BuildExecutiveLearningDecisionInput = {
  gapEngineResult: KnowledgeGapEngineResult;
  snapshot: ConversationSnapshot;
};
