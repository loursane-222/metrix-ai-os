import type { ExecutiveDecisionFollowUpItem } from "@/lib/executive-decision-follow-up";
import type { ExecutiveAccountabilityItem } from "@/lib/executive-accountability";
import { buildExecutiveActionOutcomeSummary } from "@/lib/core/executive-actions/executive-action-outcome-summary.service";
import type {
  ActionFollowUpCriticality,
  ActionFollowUpStatus,
  BuildExecutiveFollowUpIntelligenceInput,
  ExecutiveFollowUpPromptSummary,
  ExecutiveFollowUpReport,
  TrackedAction,
} from "./executive-follow-up-intelligence.types";

const MAX_TRACKED_ITEMS = 12;
const CRITICAL_OVERDUE_DAYS = 7;

export function buildExecutiveFollowUpIntelligence(
  input: BuildExecutiveFollowUpIntelligenceInput,
): ExecutiveFollowUpReport {
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();

  const fromDecisions = buildActionsFromFollowUp(input.executiveDecisionFollowUp);
  const fromAccountability = buildActionsFromAccountability(input.executiveAccountability);

  const allActions = [...fromDecisions, ...fromAccountability].slice(0, MAX_TRACKED_ITEMS);

  const completedActions = allActions.filter((a) => a.status === "COMPLETED");
  const overdueActions   = allActions.filter((a) => a.status === "OVERDUE");
  const pendingActions   = allActions.filter((a) => a.status === "PENDING");

  const totalCount     = allActions.length;
  const completedCount = completedActions.length;
  const executionScore = totalCount === 0
    ? 100
    : Math.round((completedCount / totalCount) * 100);

  const criticalFollowUps = [...overdueActions, ...pendingActions]
    .filter((a) => a.criticalityLevel === "CRITICAL" || a.criticalityLevel === "HIGH")
    .slice(0, 5);

  const summary       = buildSummary(completedCount, totalCount, overdueActions.length);
  const promptSummary = buildPromptSummary(summary, executionScore, criticalFollowUps, overdueActions.length > 0);

  const recentActionOutcomes =
    input.recentCompletedActions && input.recentCompletedActions.length > 0
      ? buildExecutiveActionOutcomeSummary(input.recentCompletedActions)
      : null;

  return {
    organizationId: input.organizationId,
    generatedAt,
    completedActions,
    pendingActions,
    overdueActions,
    executionScore,
    summary,
    criticalFollowUps,
    promptSummary,
    recentActionOutcomes,
  };
}

function buildActionsFromFollowUp(
  followUp: BuildExecutiveFollowUpIntelligenceInput["executiveDecisionFollowUp"],
): TrackedAction[] {
  if (!followUp) return [];

  return followUp.items.map((item) => followUpItemToTrackedAction(item));
}

function followUpItemToTrackedAction(item: ExecutiveDecisionFollowUpItem): TrackedAction {
  const status = resolveFollowUpStatus(item.status);
  const completionEvidence = status === "COMPLETED" ? resolveCompletionEvidence(item.status) : null;

  return {
    id: item.id,
    title: item.title,
    status,
    source: "DECISION_FOLLOW_UP",
    completionEvidence,
    daysOpen: item.ageDays,
    criticalityLevel: resolveFollowUpCriticality(item.priority),
  };
}

function resolveFollowUpStatus(
  status: ExecutiveDecisionFollowUpItem["status"],
): ActionFollowUpStatus {
  if (status === "RESOLVED_SUCCESS" || status === "RESOLVED_FAILURE" || status === "ABANDONED") {
    return "COMPLETED";
  }
  if (status === "OVERDUE" || status === "REAGENDA_REQUIRED") {
    return "OVERDUE";
  }
  return "PENDING";
}

function resolveCompletionEvidence(
  status: ExecutiveDecisionFollowUpItem["status"],
): string | null {
  if (status === "RESOLVED_SUCCESS") return "Karar başarıyla tamamlandı.";
  if (status === "RESOLVED_FAILURE") return "Karar başarısız sonuçlandı.";
  if (status === "ABANDONED")        return "Karardan vazgeçildi.";
  return null;
}

function resolveFollowUpCriticality(
  priority: ExecutiveDecisionFollowUpItem["priority"],
): ActionFollowUpCriticality {
  if (priority === "CRITICAL") return "CRITICAL";
  if (priority === "HIGH")     return "HIGH";
  if (priority === "MEDIUM")   return "MEDIUM";
  return "LOW";
}

function buildActionsFromAccountability(
  accountability: BuildExecutiveFollowUpIntelligenceInput["executiveAccountability"],
): TrackedAction[] {
  if (!accountability) return [];

  return accountability.accountableItems.map((item) =>
    accountabilityItemToTrackedAction(item),
  );
}

function accountabilityItemToTrackedAction(
  item: ExecutiveAccountabilityItem,
): TrackedAction {
  const isOverdue = item.daysOverdue !== null && item.daysOverdue > 0;
  const status: ActionFollowUpStatus = isOverdue ? "OVERDUE" : "PENDING";
  const criticalityLevel = resolveAccountabilityCriticality(item.daysOverdue);

  return {
    id: item.id,
    title: item.title,
    status,
    source: "ACCOUNTABILITY",
    completionEvidence: null,
    daysOpen: item.daysOverdue,
    criticalityLevel,
  };
}

function resolveAccountabilityCriticality(daysOverdue: number | null): ActionFollowUpCriticality {
  if (daysOverdue === null) return "MEDIUM";
  if (daysOverdue > CRITICAL_OVERDUE_DAYS) return "CRITICAL";
  if (daysOverdue > 0)                     return "HIGH";
  return "MEDIUM";
}

function buildSummary(
  completedCount: number,
  totalCount: number,
  overdueCount: number,
): string {
  if (totalCount === 0) {
    return "Son dönemde takip edilecek aksiyon kaydı yok.";
  }

  if (completedCount === totalCount) {
    return `Son dönemdeki ${totalCount} aksiyonun tamamı tamamlandı.`;
  }

  const pending    = totalCount - completedCount;
  const scorePct   = Math.round((completedCount / totalCount) * 100);
  const overduePart = overdueCount > 0
    ? ` Bunlardan ${overdueCount}'i gecikmiş.`
    : "";

  return `Son dönemdeki ${totalCount} aksiyondan ${completedCount}'i tamamlandı (%${scorePct}).${overduePart} ${pending} aksiyon takip bekliyor.`;
}

function buildPromptSummary(
  summary: string,
  executionScore: number,
  criticalFollowUps: TrackedAction[],
  hasOverdue: boolean,
): ExecutiveFollowUpPromptSummary {
  const topCriticalFollowUp = criticalFollowUps[0]?.title ?? null;

  let executionScoreLabel: string;
  if (executionScore >= 80) {
    executionScoreLabel = "Aksiyon icra oranı yüksek.";
  } else if (executionScore >= 50) {
    executionScoreLabel = "Aksiyon icra oranı orta; takip gerekiyor.";
  } else {
    executionScoreLabel = "Aksiyon icra oranı düşük; kritik aksiyonlar bekliyor.";
  }

  return {
    summaryLine: summary,
    executionScoreLabel,
    topCriticalFollowUp,
    hasOverdue,
  };
}
