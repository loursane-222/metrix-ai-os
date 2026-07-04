// ─── Executive Goal Intelligence V1.1 — Types ─────────────────────────────────

export type GoalCategoryKey =
  | "MONTHLY_REVENUE"
  | "ANNUAL_REVENUE"
  | "PRIMARY_OBJECTIVE"
  | "GROWTH"
  | "STRATEGIC_1Y"
  | "STRATEGIC_3Y";

export type GoalReadiness = "STRONG" | "PARTIAL" | "MINIMAL" | "ABSENT";

export type ExecutiveGoalEntry = {
  categoryKey: GoalCategoryKey;
  label: string;
  memoryKeys: string[];
  isCritical: boolean;
  suggestedQuestion: string;
};

export type MatchedGoalItem = {
  categoryKey: GoalCategoryKey;
  label: string;
  value: string;
};

export type ExecutiveGoalGapResult = {
  presentCategories: GoalCategoryKey[];
  missingCategories: GoalCategoryKey[];
  criticalMissing: GoalCategoryKey[];
  readiness: GoalReadiness;
  criticalPresent: number;
  matchedItems: MatchedGoalItem[];
};

export type GoalLearningSignal = {
  shouldLearn: boolean;
  priorityCategoryKey: GoalCategoryKey | null;
  suggestedQuestion: string | null;
};

export type ExecutiveGoalIntelligence = {
  generatedAt: string;
  readiness: GoalReadiness;
  totalPresent: number;
  totalCategories: number;
  criticalMissingCount: number;
  criticalMissing: GoalCategoryKey[];
  promptLine: string | null;
  monthlyRevenueTarget: number | null;
  // V1.2 için hazır — henüz Learning Engine tarafından tüketilmiyor
  learningSignal: GoalLearningSignal;
};
