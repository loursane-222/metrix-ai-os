import type { JsonInputRootValue } from "@/lib/api/validation";

export type ActionType = "SETUP" | "IMPORT" | "CONFIGURE" | "CREATE" | "REVIEW";

export type ActionRecommendation = {
  id: string;
  title: string;
  reason: string;
  category: string;
  module: string;
  actionType: ActionType;
  impactScore: number;
  urgencyScore: number;
  effortScore: number;
  priorityScore: number;
  estimatedMinutes: number;
};

export type ActionEngineResult = {
  topAction: ActionRecommendation;
  recommendedActions: ActionRecommendation[];
  generatedBy: "deterministic";
  version: string;
};

export type ActionEngineResultJson = ActionEngineResult & JsonInputRootValue;
