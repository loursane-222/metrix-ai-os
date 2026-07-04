// ─── Executive Goal Registry V1.1 ─────────────────────────────────────────────
//
// 6 hedef kategorisi. isCritical=true olanlar readiness hesabında sayılır.
// Prisma yok. DB yok. Async yok. Saf veri.

import type { ExecutiveGoalEntry, GoalCategoryKey } from "./executive-goal-intelligence.types";

export const EXECUTIVE_GOAL_REGISTRY: ExecutiveGoalEntry[] = [
  {
    categoryKey: "MONTHLY_REVENUE",
    label: "aylık gelir hedefi",
    memoryKeys: ["current_month_target_revenue", "monthly_revenue_target", "aylik_hedef_ciro", "aylik_ciro_hedefi"],
    isCritical: true,
    suggestedQuestion: "Bu ay için gelir hedefiniz nedir?",
  },
  {
    categoryKey: "ANNUAL_REVENUE",
    label: "yıllık gelir hedefi",
    memoryKeys: ["annual_target_revenue", "annual_revenue_goal", "yillik_hedef_ciro", "yillik_hedef", "yillik_ciro_hedefi"],
    isCritical: true,
    suggestedQuestion: "Bu yıl için yıllık ciro hedefiniz nedir?",
  },
  {
    categoryKey: "PRIMARY_OBJECTIVE",
    label: "birincil şirket hedefi",
    memoryKeys: ["primary_goal", "top_goal", "ana_hedef", "birincil_hedef", "sirket_hedefi"],
    isCritical: true,
    suggestedQuestion: "Şirketinizin öncelikli hedefi nedir?",
  },
  {
    categoryKey: "GROWTH",
    label: "büyüme hedefi",
    memoryKeys: ["growth_target", "buyume_hedefi", "buyume_orani", "growth_goal"],
    isCritical: false,
    suggestedQuestion: "Büyüme hedefiniz nedir?",
  },
  {
    categoryKey: "STRATEGIC_1Y",
    label: "1 yıllık stratejik hedef",
    memoryKeys: ["one_year_goal", "1_year_goal", "bir_yillik_hedef", "strategic_1y"],
    isCritical: false,
    suggestedQuestion: "Önümüzdeki 1 yılda ulaşmak istediğiniz en önemli hedef nedir?",
  },
  {
    categoryKey: "STRATEGIC_3Y",
    label: "3 yıllık stratejik hedef",
    memoryKeys: ["three_year_goal", "3_year_goal", "uc_yillik_hedef", "strategic_3y"],
    isCritical: false,
    suggestedQuestion: "3 yıl içinde şirketinizi nerede görmek istiyorsunuz?",
  },
];

export const CRITICAL_GOAL_CATEGORIES: GoalCategoryKey[] = EXECUTIVE_GOAL_REGISTRY
  .filter((e) => e.isCritical)
  .map((e) => e.categoryKey);
