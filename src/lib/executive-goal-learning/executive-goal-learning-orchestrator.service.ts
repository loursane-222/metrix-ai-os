// ─── Executive Goal Learning Orchestrator V1 ──────────────────────────────────
//
// GoalIntelligence → GoalCuriosity → Question → Opportunity → GoalLearningDecision.
// Executive Question Engine ve Conversation Opportunity Engine doğrudan reuse edilir.
// Prisma yok. DB yok. Async yok. Saf pipe.

import { buildGoalCuriosity } from "./executive-goal-curiosity.service";
import { buildExecutiveQuestion } from "@/lib/executive-question";
import { buildConversationOpportunity } from "@/lib/executive-conversation-opportunity";
import type { GoalReadiness } from "@/lib/executive-goal-intelligence";

import type {
  BuildGoalLearningDecisionInput,
  GoalLearningDecision,
} from "./executive-goal-learning.types";

export function buildGoalLearningDecision(
  input: BuildGoalLearningDecisionInput,
): GoalLearningDecision {
  const { goalIntelligence, snapshot } = input;

  const curiosity = buildGoalCuriosity(goalIntelligence);
  const goalPriorityScore = resolveGoalPriorityScore(goalIntelligence.readiness);

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

  const targetCategoryKey = selectedQuestion.shouldAsk
    ? (selectedQuestion.targetKey as GoalLearningDecision["targetCategoryKey"])
    : null;

  return {
    generatedAt: new Date().toISOString(),
    curiosity,
    question: selectedQuestion,
    opportunity: selectedOpportunity,
    shouldAskNow: selectedOpportunity.shouldAskNow,
    finalQuestion: selectedOpportunity.selectedQuestion,
    targetCategoryKey,
    goalPriorityScore,
  };
}

function resolveGoalPriorityScore(readiness: GoalReadiness): number {
  switch (readiness) {
    case "ABSENT":  return 1.0;
    case "MINIMAL": return 0.8;
    case "PARTIAL": return 0.5;
    case "STRONG":  return 0.0;
  }
}
