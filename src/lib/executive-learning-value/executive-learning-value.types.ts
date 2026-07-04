// ─── Executive Learning Value Engine V1 — Type Definitions ───────────────────
//
// Prisma import yok. DB bağımlılığı yok. Saf tip tanımlarıdır.

import type { ExecutiveCuriosity } from "@/lib/executive-curiosity";
import type { ExecutiveQuestion } from "@/lib/executive-question";
import type { ConversationOpportunity } from "@/lib/executive-conversation-opportunity";

export type { ExecutiveCuriosity, ExecutiveQuestion, ConversationOpportunity };

export type LearningValueRecommendation = "ASK_NOW" | "ASK_LATER" | "IGNORE";

export type LearningBusinessImpact = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type ExecutiveLearningValue = {
  generatedAt: string;
  targetKey: string;
  targetLabel: string;
  valueScore: number;
  businessImpact: LearningBusinessImpact;
  decisionBlocking: boolean;
  recommendation: LearningValueRecommendation;
  finalQuestion: string;
  reason: string;
};

export type BuildExecutiveLearningValueInput = {
  curiosity: ExecutiveCuriosity;
  question: ExecutiveQuestion;
  opportunity: ConversationOpportunity;
};
