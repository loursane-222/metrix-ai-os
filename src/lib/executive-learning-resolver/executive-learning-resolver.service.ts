import type {
  BuildLearningResolverDecisionInput,
  ExecutiveLearningResolverDecision,
  LearningCandidate,
} from "./executive-learning-resolver.types";

function buildKnowledgeCandidate(
  decision: NonNullable<BuildLearningResolverDecisionInput["knowledgeLearningDecision"]>,
): LearningCandidate {
  const isGradeF = decision.curiosity.readinessGrade === "F";
  return {
    source: "KNOWLEDGE",
    shouldAskNow: decision.shouldAskNow,
    finalQuestion: decision.finalQuestion,
    targetKey: decision.value.targetKey,
    priorityScore: decision.value.valueScore,
    hardPriority: isGradeF ? 90 : 0,
    reason: isGradeF
      ? "Knowledge readiness grade F — critical gap"
      : "Knowledge learning candidate",
  };
}

function buildGoalCandidate(
  decision: NonNullable<BuildLearningResolverDecisionInput["goalLearningDecision"]>,
): LearningCandidate {
  const isAbsent = decision.goalPriorityScore === 1.0;
  return {
    source: "GOAL",
    shouldAskNow: decision.shouldAskNow,
    finalQuestion: decision.finalQuestion,
    targetKey: decision.targetCategoryKey,
    priorityScore: decision.goalPriorityScore,
    hardPriority: isAbsent ? 100 : 0,
    reason: isAbsent
      ? "Goal entirely absent — highest priority"
      : "Goal learning candidate",
  };
}

function pickWinner(candidates: LearningCandidate[]): LearningCandidate | null {
  const active = candidates.filter((c) => c.shouldAskNow);
  if (active.length === 0) return null;

  return active.reduce((best, current) => {
    if (current.hardPriority !== best.hardPriority) {
      return current.hardPriority > best.hardPriority ? current : best;
    }
    if (current.priorityScore !== best.priorityScore) {
      return current.priorityScore > best.priorityScore ? current : best;
    }
    // tiebreak: GOAL wins
    return current.source === "GOAL" ? current : best;
  });
}

export function buildLearningResolverDecision(
  input: BuildLearningResolverDecisionInput,
): ExecutiveLearningResolverDecision {
  const candidates: LearningCandidate[] = [];

  if (input.knowledgeLearningDecision != null) {
    candidates.push(buildKnowledgeCandidate(input.knowledgeLearningDecision));
  }

  if (input.goalLearningDecision != null) {
    candidates.push(buildGoalCandidate(input.goalLearningDecision));
  }

  const winner = pickWinner(candidates);

  if (winner == null) {
    return {
      generatedAt: new Date().toISOString(),
      source: "NONE",
      shouldAskNow: false,
      finalQuestion: "",
      targetKey: null,
      winningScore: 0,
      reason: "No active learning candidate",
      candidates,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    source: winner.source,
    shouldAskNow: true,
    finalQuestion: winner.finalQuestion,
    targetKey: winner.targetKey,
    winningScore: winner.hardPriority > 0 ? winner.hardPriority : winner.priorityScore,
    reason: winner.reason,
    candidates,
  };
}
