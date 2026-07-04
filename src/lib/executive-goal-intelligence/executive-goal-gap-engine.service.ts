// ─── Executive Goal Gap Engine V1.1 ───────────────────────────────────────────
//
// MemoryContextItem[] → hangi hedef kategorileri eksik? Saf hesaplama.
// Boş/anlamsız değerler missing kabul edilir.
// Prisma yok. DB yok. Async yok.

import type { MemoryContextItem } from "@/lib/memory/memory-context.types";
import type {
  ExecutiveGoalGapResult,
  GoalCategoryKey,
  GoalReadiness,
  MatchedGoalItem,
} from "./executive-goal-intelligence.types";
import { EXECUTIVE_GOAL_REGISTRY } from "./executive-goal-registry";

const EMPTY_GOAL_VALUES = new Set([
  "",
  "-",
  "n/a",
  "belirsiz",
  "henüz belirlenmedi",
]);

function isValidGoalValue(value: string): boolean {
  return !EMPTY_GOAL_VALUES.has(value.trim().toLowerCase());
}

export function buildExecutiveGoalGap(
  strategicItems: MemoryContextItem[],
): ExecutiveGoalGapResult {
  const presentCategories: GoalCategoryKey[] = [];
  const missingCategories: GoalCategoryKey[] = [];
  const matchedItems: MatchedGoalItem[] = [];

  for (const entry of EXECUTIVE_GOAL_REGISTRY) {
    const matchingItem = strategicItems.find((item) =>
      entry.memoryKeys.includes(item.key.toLowerCase()) &&
      isValidGoalValue(item.value),
    );

    if (matchingItem) {
      presentCategories.push(entry.categoryKey);
      matchedItems.push({
        categoryKey: entry.categoryKey,
        label: entry.label,
        value: matchingItem.value.length > 60
          ? matchingItem.value.slice(0, 57) + "…"
          : matchingItem.value,
      });
    } else {
      missingCategories.push(entry.categoryKey);
    }
  }

  const criticalMissing = missingCategories.filter((categoryKey) => {
    const entry = EXECUTIVE_GOAL_REGISTRY.find((e) => e.categoryKey === categoryKey);
    return entry?.isCritical ?? false;
  });

  const criticalPresent = EXECUTIVE_GOAL_REGISTRY.filter(
    (e) => e.isCritical && presentCategories.includes(e.categoryKey),
  ).length;

  return {
    presentCategories,
    missingCategories,
    criticalMissing,
    matchedItems,
    readiness: resolveReadiness(criticalPresent),
    criticalPresent,
  };
}

function resolveReadiness(criticalPresent: number): GoalReadiness {
  if (criticalPresent >= 3) return "STRONG";
  if (criticalPresent === 2) return "PARTIAL";
  if (criticalPresent === 1) return "MINIMAL";
  return "ABSENT";
}
