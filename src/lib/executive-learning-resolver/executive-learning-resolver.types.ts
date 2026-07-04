import type { ExecutiveLearningDecision } from "@/lib/executive-learning-orchestrator";
import type { GoalLearningDecision } from "@/lib/executive-goal-learning";

export type { ExecutiveLearningDecision, GoalLearningDecision };

export type LearningResolverSource = "KNOWLEDGE" | "GOAL" | "NONE";

export type LearningCandidate = {
  source: LearningResolverSource;
  shouldAskNow: boolean;
  finalQuestion: string;
  targetKey: string | null;
  priorityScore: number;
  hardPriority: number;
  reason: string;
};

export type ExecutiveLearningResolverDecision = {
  generatedAt: string;
  source: LearningResolverSource;
  shouldAskNow: boolean;
  finalQuestion: string;
  targetKey: string | null;
  winningScore: number;
  reason: string;
  candidates: LearningCandidate[];
};

export type BuildLearningResolverDecisionInput = {
  knowledgeLearningDecision?: ExecutiveLearningDecision | null;
  goalLearningDecision?: GoalLearningDecision | null;
};
