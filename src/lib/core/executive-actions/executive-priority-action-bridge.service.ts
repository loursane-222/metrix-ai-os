import type { ExecutiveAction } from "@prisma/client";
import type {
  ExecutivePrioritizationResult,
  ExecutivePriorityLevel,
  ExecutivePriorityMove,
  ExecutivePriorityUrgency,
} from "@/lib/executive-prioritization/executive-prioritization.types";
import type {
  CreateExecutiveActionInput,
  ExecutiveActionPriority,
} from "./executive-action.types";
import { createExecutiveAction } from "./executive-action-engine.service";
import {
  resolveExecutiveActionOwner,
  type ResolvedExecutiveActionOwner,
} from "./executive-action-owner-resolver.service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TURKISH_CHAR_MAP: Record<string, string> = {
  ğ: "g", ü: "u", ş: "s", ı: "i", ö: "o", ç: "c",
  Ğ: "G", Ü: "U", Ş: "S", İ: "I", Ö: "O", Ç: "C",
};

function normalizeAreaKey(area: string): string {
  return area
    .split("")
    .map((ch) => TURKISH_CHAR_MAP[ch] ?? ch)
    .join("")
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
}

type ActivePriorityLevel = Exclude<ExecutivePriorityLevel, "IGNORE_FOR_NOW">;

const PRIORITY_MAP: Record<
  ActivePriorityLevel,
  Record<ExecutivePriorityUrgency, ExecutiveActionPriority>
> = {
  CRITICAL: { TODAY: "CRITICAL", THIS_WEEK: "HIGH" },
  HIGH:     { TODAY: "HIGH",     THIS_WEEK: "MEDIUM" },
  WATCH:    { TODAY: "MEDIUM",   THIS_WEEK: "LOW" },
};

function resolvePriority(
  overallLevel: ExecutivePriorityLevel,
  urgency: ExecutivePriorityUrgency,
): ExecutiveActionPriority | null {
  if (overallLevel === "IGNORE_FOR_NOW") return null;
  return PRIORITY_MAP[overallLevel][urgency];
}

function resolveDueDate(urgency: ExecutivePriorityUrgency): Date {
  const d = new Date();
  if (urgency === "TODAY") {
    d.setHours(23, 59, 59, 999);
    return d;
  }
  // THIS_WEEK → this Friday EOD; if today is Saturday/Sunday, next Friday
  const daysUntilFriday = (5 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + daysUntilFriday);
  d.setHours(23, 59, 59, 999);
  return d;
}

function buildTitle(move: ExecutivePriorityMove): string {
  const base = move.specificTarget
    ? `[${move.specificTarget}] ${move.action}`
    : move.action;
  return base.slice(0, 250);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function priorityMoveToActionInput(
  move: ExecutivePriorityMove,
  organizationId: string,
  overallLevel: ExecutivePriorityLevel,
  owner?: ResolvedExecutiveActionOwner,
): CreateExecutiveActionInput | null {
  const priority = resolvePriority(overallLevel, move.urgency);
  if (!priority) return null;

  const resolvedOwner = owner ?? { ownerType: "UNASSIGNED" as const, ownerId: null };

  return {
    organizationId,
    sourceType: "EXECUTIVE_PRIORITY",
    sourceId: `PRIORITY_AREA_${normalizeAreaKey(move.area)}`,
    title: buildTitle(move),
    reason: move.riskIfIgnored ?? move.concreteNextStep ?? move.action,
    priority,
    ownerType: resolvedOwner.ownerType,
    ownerId: resolvedOwner.ownerId,
    dueDate: resolveDueDate(move.urgency),
  };
}

export type SyncPriorityActionsOwnerContext = {
  orgOwnerUserId: string | null;
  currentUserId?: string | null;
};

export async function syncPriorityMovesToActions(
  result: ExecutivePrioritizationResult,
  organizationId: string,
  ownerContext?: SyncPriorityActionsOwnerContext,
): Promise<ExecutiveAction[]> {
  if (result.overallPriorityLevel === "IGNORE_FOR_NOW") return [];

  const owner = resolveExecutiveActionOwner({
    sourceType: "EXECUTIVE_PRIORITY",
    orgOwnerUserId: ownerContext?.orgOwnerUserId ?? null,
    currentUserId: ownerContext?.currentUserId ?? null,
  });

  const actions: ExecutiveAction[] = [];

  for (const move of result.topExecutiveMoves) {
    const input = priorityMoveToActionInput(move, organizationId, result.overallPriorityLevel, owner);
    if (!input) continue;
    const action = await createExecutiveAction(input);
    actions.push(action);
  }

  return actions;
}
