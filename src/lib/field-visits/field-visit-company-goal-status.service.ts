import { listSalesGoals } from "@/lib/core/goals/goal.service";
import { buildExecutiveGoalIntelligence } from "@/lib/executive-goal-intelligence";
import { analyzeGoalAchievement } from "@/lib/executive-forecasting/goal-achievement-analyzer.service";

export type CompanyMonthlyGoalStatus = Readonly<{
  monthlyTarget: number;
  monthToDateRevenue: number;
  forecastedMonthEndRevenue: number;
  goalAchievementRate: number;
  monthToDateCashCollection: number;
}>;

/**
 * Reuses the existing, already-live monthly goal-achievement engine (the
 * same one behind daily briefings/board reports/executive alerts) rather
 * than computing target-vs-actual again here. Returns null when the
 * organization has no active monthly revenue target set — there is
 * nothing honest to show against.
 */
export async function resolveCompanyMonthlyGoalStatus(organizationId: string): Promise<CompanyMonthlyGoalStatus | null> {
  const allMonthlyGoals = await listSalesGoals({ organizationId, period: "MONTHLY", status: "ACTIVE" });
  // listSalesGoals has no scope filter, so a rep's PERSON-scoped monthly
  // goal (rep-goals feature) would otherwise leak into the company-wide
  // target here — filtered explicitly rather than extending the shared
  // repository query.
  const monthlyGoals = allMonthlyGoals.filter((goal) => goal.scope === "COMPANY");
  if (monthlyGoals.length === 0) return null;

  const goalIntelligence = buildExecutiveGoalIntelligence(null, monthlyGoals);
  if (goalIntelligence.monthlyRevenueTarget === null) return null;

  const { projectionFields } = await analyzeGoalAchievement(organizationId, goalIntelligence, null);
  if (projectionFields.monthlyTarget === undefined || projectionFields.goalAchievementRate === undefined) return null;

  return {
    monthlyTarget: projectionFields.monthlyTarget,
    monthToDateRevenue: projectionFields.monthToDateRevenue ?? 0,
    forecastedMonthEndRevenue: projectionFields.forecastedMonthEndRevenue ?? 0,
    goalAchievementRate: projectionFields.goalAchievementRate,
    monthToDateCashCollection: projectionFields.monthToDateCashCollection ?? 0,
  };
}
