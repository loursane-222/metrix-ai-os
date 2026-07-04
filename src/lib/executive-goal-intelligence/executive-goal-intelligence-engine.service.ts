// ─── Executive Goal Intelligence Engine V1.2 ──────────────────────────────────
//
// PRIMARY: MemoryContext.strategic (V1.1 mantığı aynen korunur).
// ENRICHMENT: SalesGoal kayıtları, base sonucu monthlyRevenueTarget ve
// promptLine düzeyinde zenginleştirir. Readiness memory'den gelir.

import type { SalesGoal } from "@prisma/client";
import type { MemoryContext, MemoryContextItem } from "@/lib/memory/memory-context.types";
import type {
  ExecutiveGoalIntelligence,
  GoalCategoryKey,
  GoalLearningSignal,
  GoalReadiness,
  MatchedGoalItem,
} from "./executive-goal-intelligence.types";
import { buildExecutiveGoalGap } from "./executive-goal-gap-engine.service";
import { CRITICAL_GOAL_CATEGORIES, EXECUTIVE_GOAL_REGISTRY } from "./executive-goal-registry";

const TOTAL_CATEGORIES = EXECUTIVE_GOAL_REGISTRY.length;
const ALL_CRITICAL = EXECUTIVE_GOAL_REGISTRY.filter((e) => e.isCritical);

export function buildExecutiveGoalIntelligence(
  memoryContext: MemoryContext | null,
  salesGoals?: SalesGoal[] | null,
): ExecutiveGoalIntelligence {
  const base = buildFromMemory(memoryContext);

  if (!salesGoals || salesGoals.length === 0) {
    return base;
  }

  return enrichWithSalesGoals(base, salesGoals);
}

// ─── V1.1 Memory Logic (değişmeden korunur) ───────────────────────────────────

function buildFromMemory(memoryContext: MemoryContext | null): ExecutiveGoalIntelligence {
  if (!memoryContext) {
    const allCriticalKeys = ALL_CRITICAL.map((e) => e.categoryKey);
    return {
      generatedAt: new Date().toISOString(),
      readiness: "ABSENT",
      totalPresent: 0,
      totalCategories: TOTAL_CATEGORIES,
      criticalMissingCount: ALL_CRITICAL.length,
      criticalMissing: allCriticalKeys,
      promptLine: "Şirket hedefleri henüz kaydedilmemiş — hedef bazlı değerlendirme yapılamıyor.",
      monthlyRevenueTarget: null,
      learningSignal: buildLearningSignal("ABSENT", allCriticalKeys),
    };
  }

  const gap = buildExecutiveGoalGap(memoryContext.strategic);
  const monthlyRevenueTarget = extractMonthlyRevenueTarget(memoryContext.strategic);

  return {
    generatedAt: new Date().toISOString(),
    readiness: gap.readiness,
    totalPresent: gap.presentCategories.length,
    totalCategories: TOTAL_CATEGORIES,
    criticalMissingCount: gap.criticalMissing.length,
    criticalMissing: gap.criticalMissing,
    promptLine: resolvePromptLine(gap.readiness, gap.criticalMissing, gap.matchedItems),
    monthlyRevenueTarget,
    learningSignal: buildLearningSignal(gap.readiness, gap.criticalMissing),
  };
}

// ─── V1.2 SalesGoal Enrichment ────────────────────────────────────────────────

function enrichWithSalesGoals(
  base: ExecutiveGoalIntelligence,
  salesGoals: SalesGoal[],
): ExecutiveGoalIntelligence {
  const active = salesGoals.filter((g) => g.status === "ACTIVE");
  const pool = active.length > 0 ? active : salesGoals;

  // monthlyRevenueTarget: memory null ise MONTHLY SalesGoal'dan doldur
  let monthlyRevenueTarget = base.monthlyRevenueTarget;
  if (monthlyRevenueTarget === null) {
    const monthly = pool.find(
      (g) => g.period === "MONTHLY" && g.targetRevenueCents !== null,
    );
    if (monthly?.targetRevenueCents) {
      monthlyRevenueTarget = Number(monthly.targetRevenueCents) / 100;
    }
  }

  // promptLine: SalesGoal özeti varsa memory satırına eklenir
  const salesLine = buildSalesGoalSummaryLine(pool);
  const promptLine = salesLine
    ? base.promptLine
      ? `${base.promptLine} ${salesLine}`
      : salesLine
    : base.promptLine;

  return { ...base, monthlyRevenueTarget, promptLine };
}

const PERIOD_LABELS: Record<string, string> = {
  MONTHLY: "Aylık",
  QUARTERLY: "Çeyreklik",
  YEARLY: "Yıllık",
  CUSTOM: "Özel dönem",
};

function buildSalesGoalSummaryLine(goals: SalesGoal[]): string | null {
  const parts: string[] = [];

  for (const goal of goals) {
    const label = PERIOD_LABELS[goal.period] ?? goal.period;
    if (goal.targetRevenueCents !== null) {
      parts.push(`${label} gelir hedefi: ${formatCentsAsLabel(goal.targetRevenueCents)}`);
    } else if (goal.title) {
      const t = goal.title;
      parts.push(`${label} hedef: ${t.length > 40 ? t.slice(0, 37) + "…" : t}`);
    }
  }

  if (parts.length === 0) return null;
  return `Kayıtlı hedef planı: ${parts.slice(0, 3).join(" · ")}.`;
}

function formatCentsAsLabel(cents: bigint): string {
  const amount = Number(cents) / 100;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace(".", ",")} milyon ₺`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000)} bin ₺`;
  return `₺${amount.toLocaleString("tr-TR")}`;
}

// ─── Shared helpers (V1.1'den taşındı) ───────────────────────────────────────

const MONTHLY_REVENUE_KEYS = EXECUTIVE_GOAL_REGISTRY.find(
  (e) => e.categoryKey === "MONTHLY_REVENUE",
)!.memoryKeys;

function extractMonthlyRevenueTarget(strategicItems: MemoryContextItem[]): number | null {
  const item = strategicItems.find(
    (i) => MONTHLY_REVENUE_KEYS.includes(i.key.toLowerCase()),
  );
  if (!item) return null;
  return parseRevenueNumber(item.value);
}

function parseRevenueNumber(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/₺/g, "").replace(/\s+/g, " ").trim();

  const milyonM = s.match(/^([\d.,]+)\s*milyon/);
  if (milyonM) {
    const n = parseFloat(milyonM[1].replace(/\./g, "").replace(",", "."));
    return isNaN(n) || n <= 0 ? null : Math.round(n * 1_000_000);
  }

  const binM = s.match(/^([\d.,]+)\s*(bin|k\b)/);
  if (binM) {
    const n = parseFloat(binM[1].replace(/\./g, "").replace(",", "."));
    return isNaN(n) || n <= 0 ? null : Math.round(n * 1_000);
  }

  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    const n = parseInt(s.replace(/\./g, ""), 10);
    return isNaN(n) || n <= 0 ? null : n;
  }

  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) || n <= 0 ? null : n;
}

function resolvePromptLine(
  readiness: GoalReadiness,
  criticalMissing: GoalCategoryKey[],
  matchedItems: MatchedGoalItem[],
): string | null {
  if (readiness === "STRONG") {
    const criticalItems = matchedItems.filter((i) =>
      CRITICAL_GOAL_CATEGORIES.includes(i.categoryKey),
    );
    if (criticalItems.length === 0) return null;
    const valueLines = criticalItems
      .map((i) => `${i.label}: ${i.value}`)
      .join(" · ");
    return `Kayıtlı şirket hedefleri: ${valueLines}.`;
  }

  if (readiness === "ABSENT") {
    return "Şirket hedefleri henüz kaydedilmemiş — hedef bazlı değerlendirme yapılamıyor.";
  }

  const missingLabels = criticalMissing
    .map((key) => EXECUTIVE_GOAL_REGISTRY.find((e) => e.categoryKey === key)?.label ?? key)
    .join(", ");

  return `Kayıtlı hedefler eksik — ${missingLabels} henüz girilmemiş.`;
}

function buildLearningSignal(
  readiness: GoalReadiness,
  criticalMissing: GoalCategoryKey[],
): GoalLearningSignal {
  if (readiness === "STRONG") {
    return { shouldLearn: false, priorityCategoryKey: null, suggestedQuestion: null };
  }

  const firstMissing = criticalMissing[0] ?? null;
  const entry = firstMissing
    ? EXECUTIVE_GOAL_REGISTRY.find((e) => e.categoryKey === firstMissing)
    : null;

  return {
    shouldLearn: true,
    priorityCategoryKey: firstMissing,
    suggestedQuestion: entry?.suggestedQuestion ?? null,
  };
}
