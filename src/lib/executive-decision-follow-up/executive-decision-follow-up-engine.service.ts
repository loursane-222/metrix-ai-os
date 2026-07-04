import type { ExecutiveDecisionOutcomeType } from "@prisma/client";
import type {
  ExecutiveDecisionOutcomeSummary,
  ExecutiveDecisionRecordSummary,
} from "@/lib/executive-decision-loop";
import {
  buildAgendaRecommendation,
  buildDecisionFollowUpSummaryLine,
  buildFollowUpPromptSummary,
} from "./executive-decision-follow-up-summary.service";
import type {
  BuildExecutiveDecisionFollowUpInput,
  ExecutiveDecisionFollowUpItem,
  ExecutiveDecisionFollowUpPriority,
  ExecutiveDecisionFollowUpResult,
  ExecutiveDecisionFollowUpStatus,
} from "./executive-decision-follow-up.types";

const STALE_PROPOSED_THRESHOLD_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_ITEMS = 8;
const MAX_RECENT_OUTCOMES = 3;

export function buildExecutiveDecisionFollowUp(
  input: BuildExecutiveDecisionFollowUpInput,
): ExecutiveDecisionFollowUpResult {
  const now = input.now ?? new Date();
  const context = input.executiveDecisionContext;
  const warnings: string[] = [];

  if (!context) {
    warnings.push("executiveDecisionContext missing");
  }

  const openItems = (context?.openDecisions ?? []).map((decision) =>
    buildProposedItem(decision, now),
  );
  const committedItems = (context?.committedDecisions ?? []).map((decision) =>
    buildCommittedItem(decision, now),
  );
  const outcomeItems = buildOutcomeItems(context?.latestOutcome ?? null);
  const reagendaItems = outcomeItems
    .filter((item) => item.shouldReagenda)
    .map(toReagendaItem);

  const items = [
    ...committedItems,
    ...reagendaItems,
    ...openItems,
    ...outcomeItems,
  ].sort(compareFollowUpItems).slice(0, MAX_ITEMS);

  const overdueItems = items.filter((item) => item.status === "OVERDUE");
  const staleProposedItems = openItems
    .filter((item) => item.ageDays !== null && item.ageDays >= STALE_PROPOSED_THRESHOLD_DAYS)
    .sort(compareFollowUpItems);
  const recentOutcomes = outcomeItems
    .sort(compareFollowUpItems)
    .slice(0, MAX_RECENT_OUTCOMES);
  const primaryFollowUp = items.find(isPrimaryEligible) ?? recentOutcomes[0] ?? null;
  const summaryLine = buildDecisionFollowUpSummaryLine({
    primaryFollowUp,
    overdueCount: overdueItems.length,
    staleCount: staleProposedItems.length,
    recentOutcomeCount: recentOutcomes.length,
  });

  return {
    organizationId: input.organizationId,
    generatedAt: now.toISOString(),
    items,
    overdueItems,
    staleProposedItems,
    recentOutcomes,
    primaryFollowUp,
    agendaRecommendation: buildAgendaRecommendation(primaryFollowUp),
    summaryLine,
    promptSummary: buildFollowUpPromptSummary({ summaryLine, primaryFollowUp }),
    diagnostics: {
      generatedAt: now.toISOString(),
      staleThresholdDays: STALE_PROPOSED_THRESHOLD_DAYS,
      sourceOpenDecisionCount: context?.openDecisions.length ?? 0,
      sourceCommittedDecisionCount: context?.committedDecisions.length ?? 0,
      sourceOutcomeCount: context?.latestOutcome ? 1 : 0,
      warnings,
    },
  };
}

function buildProposedItem(
  decision: ExecutiveDecisionRecordSummary,
  now: Date,
): ExecutiveDecisionFollowUpItem {
  const ageDays = ageInDays(decision.decisionDate, now);
  const isStale = ageDays !== null && ageDays >= STALE_PROPOSED_THRESHOLD_DAYS;

  return {
    id: `decision:${decision.id}:proposed`,
    source: "DECISION",
    status: "OPEN_PROPOSED",
    title: decision.title,
    reason: isStale
      ? "Karar onerildi ancak uzun suredir taahhude donmedi."
      : decision.rationale,
    actionHint: decision.actionHint,
    priority: isStale ? bumpPriority(decision.priority, "HIGH") : normalizePriority(decision.priority),
    dueAt: decision.followUpDueAt,
    ageDays,
    decisionId: decision.id,
    outcomeId: null,
    outcome: null,
    shouldReagenda: false,
  };
}

function buildCommittedItem(
  decision: ExecutiveDecisionRecordSummary,
  now: Date,
): ExecutiveDecisionFollowUpItem {
  const dueAt = parseDate(decision.followUpDueAt);
  const isOverdue = dueAt !== null && dueAt.getTime() <= now.getTime();
  const status: ExecutiveDecisionFollowUpStatus = isOverdue ? "OVERDUE" : "AWAITING_RESULT";

  return {
    id: `decision:${decision.id}:committed`,
    source: "DECISION",
    status,
    title: decision.title,
    reason: isOverdue
      ? "Takip tarihi geldi veya gecti; sonuc netlestirilmeli."
      : "Karar taahhut edildi; sonuc takip tarihi bekleniyor.",
    actionHint: decision.actionHint ?? `"${decision.title}" kararinin sonucunu sor.`,
    priority: isOverdue ? "CRITICAL" : normalizePriority(decision.priority),
    dueAt: decision.followUpDueAt,
    ageDays: ageInDays(decision.decisionDate, now),
    decisionId: decision.id,
    outcomeId: null,
    outcome: null,
    shouldReagenda: false,
  };
}

function buildOutcomeItems(
  latestOutcome: ExecutiveDecisionOutcomeSummary | null,
): ExecutiveDecisionFollowUpItem[] {
  if (!latestOutcome) return [];

  const status = outcomeToStatus(latestOutcome.outcome);
  const shouldReagenda =
    latestOutcome.outcome === "FAILURE" || latestOutcome.outcome === "ABANDONED";

  return [
    {
      id: `outcome:${latestOutcome.id}`,
      source: "OUTCOME",
      status,
      title: latestOutcome.decisionTitle,
      reason: latestOutcome.summary ?? outcomeReason(latestOutcome.outcome),
      actionHint: shouldReagenda
        ? `"${latestOutcome.decisionTitle}" kararini yeni aksiyonla tekrar gundeme al.`
        : null,
      priority: shouldReagenda ? "HIGH" : "LOW",
      dueAt: null,
      ageDays: null,
      decisionId: null,
      outcomeId: latestOutcome.id,
      outcome: latestOutcome.outcome,
      shouldReagenda,
    },
  ];
}

function toReagendaItem(item: ExecutiveDecisionFollowUpItem): ExecutiveDecisionFollowUpItem {
  return {
    ...item,
    id: `${item.id}:reagenda`,
    status: "REAGENDA_REQUIRED",
    reason: "Karar sonucu kapanis kalitesini dusurdu; yeni karar veya aksiyon gerektiriyor.",
    priority: "HIGH",
    shouldReagenda: true,
  };
}

function outcomeToStatus(
  outcome: ExecutiveDecisionOutcomeType,
): ExecutiveDecisionFollowUpStatus {
  if (outcome === "SUCCESS") return "RESOLVED_SUCCESS";
  if (outcome === "FAILURE") return "RESOLVED_FAILURE";
  return "ABANDONED";
}

function outcomeReason(outcome: ExecutiveDecisionOutcomeType): string {
  if (outcome === "SUCCESS") return "Karar basarili sonuc verdi.";
  if (outcome === "FAILURE") return "Karar basarisiz sonuc verdi.";
  return "Karardan vazgecildi.";
}

function compareFollowUpItems(
  left: ExecutiveDecisionFollowUpItem,
  right: ExecutiveDecisionFollowUpItem,
): number {
  return (
    statusRank(right.status) - statusRank(left.status) ||
    priorityRank(right.priority) - priorityRank(left.priority) ||
    nullableDueTime(left.dueAt) - nullableDueTime(right.dueAt) ||
    (right.ageDays ?? -1) - (left.ageDays ?? -1)
  );
}

function isPrimaryEligible(item: ExecutiveDecisionFollowUpItem): boolean {
  return (
    item.status === "OVERDUE" ||
    item.status === "REAGENDA_REQUIRED" ||
    item.status === "AWAITING_RESULT" ||
    item.status === "OPEN_PROPOSED"
  );
}

function statusRank(status: ExecutiveDecisionFollowUpStatus): number {
  const map: Record<ExecutiveDecisionFollowUpStatus, number> = {
    OPEN_PROPOSED: 3,
    AWAITING_RESULT: 4,
    OVERDUE: 6,
    RESOLVED_SUCCESS: 1,
    RESOLVED_FAILURE: 1,
    ABANDONED: 1,
    REAGENDA_REQUIRED: 5,
  };

  return map[status];
}

function normalizePriority(
  priority: string | null,
): ExecutiveDecisionFollowUpPriority {
  if (
    priority === "LOW" ||
    priority === "WATCH" ||
    priority === "MEDIUM" ||
    priority === "HIGH" ||
    priority === "CRITICAL"
  ) {
    return priority;
  }

  return "WATCH";
}

function bumpPriority(
  priority: string | null,
  fallback: ExecutiveDecisionFollowUpPriority,
): ExecutiveDecisionFollowUpPriority {
  const normalized = normalizePriority(priority);
  return priorityRank(normalized) > priorityRank(fallback) ? normalized : fallback;
}

function priorityRank(priority: ExecutiveDecisionFollowUpPriority): number {
  const map: Record<ExecutiveDecisionFollowUpPriority, number> = {
    LOW: 1,
    WATCH: 2,
    MEDIUM: 3,
    HIGH: 4,
    CRITICAL: 5,
  };

  return map[priority];
}

function ageInDays(dateString: string, now: Date): number | null {
  const date = parseDate(dateString);
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY));
}

function nullableDueTime(value: string | null): number {
  return parseDate(value)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
