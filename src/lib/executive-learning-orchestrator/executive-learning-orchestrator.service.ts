// ─── Executive Learning Orchestrator V1 ──────────────────────────────────────
//
// Curiosity → Question → Opportunity → Value zincirini tek çağrıda çalıştırır.
// Yeni iş mantığı üretmez. Saf pipe.
// Prisma import yok. DB çağrısı yok. async yok.

import { buildExecutiveCuriosity } from "@/lib/executive-curiosity";
import { buildExecutiveQuestion } from "@/lib/executive-question";
import { buildConversationOpportunity } from "@/lib/executive-conversation-opportunity";
import { buildExecutiveLearningValue } from "@/lib/executive-learning-value";

import type {
  BuildExecutiveLearningDecisionInput,
  ExecutiveLearningDecision,
} from "./executive-learning-orchestrator.types";

export function buildExecutiveLearningDecision(
  input: BuildExecutiveLearningDecisionInput,
): ExecutiveLearningDecision {
  const { gapEngineResult, snapshot } = input;

  const curiosity = buildExecutiveCuriosity({ gapEngineResult });

  // İlk aday: curiosity'nin belirlediği top target
  let selectedQuestion = buildExecutiveQuestion({ curiosity });
  let selectedOpportunity = buildConversationOpportunity({ question: selectedQuestion, snapshot });

  // SKIP durumunda learningQueue'daki alternatif adayları dene (ilk non-SKIP kazanır)
  if (selectedOpportunity.timing === "SKIP" && curiosity.learningQueue.length > 1) {
    for (const candidate of curiosity.learningQueue.slice(1)) {
      const altCuriosity = { ...curiosity, topLearningTarget: candidate };
      const altQuestion = buildExecutiveQuestion({ curiosity: altCuriosity });
      const altOpportunity = buildConversationOpportunity({ question: altQuestion, snapshot });
      if (altOpportunity.timing !== "SKIP") {
        selectedQuestion = altQuestion;
        selectedOpportunity = altOpportunity;
        break;
      }
    }
  }

  const value = buildExecutiveLearningValue({
    curiosity,
    question: selectedQuestion,
    opportunity: selectedOpportunity,
  });

  return {
    generatedAt: new Date().toISOString(),
    curiosity,
    question: selectedQuestion,
    opportunity: selectedOpportunity,
    value,
    recommendation: value.recommendation,
    finalQuestion: value.finalQuestion,
    shouldAskNow: selectedOpportunity.shouldAskNow,
  };
}
