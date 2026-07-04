import type {
  ExecutiveDecisionFollowUpAgendaRecommendation,
  ExecutiveDecisionFollowUpItem,
  ExecutiveDecisionFollowUpPromptSummary,
  ExecutiveDecisionFollowUpStatus,
} from "./executive-decision-follow-up.types";

export function buildDecisionFollowUpSummaryLine(input: {
  primaryFollowUp: ExecutiveDecisionFollowUpItem | null;
  overdueCount: number;
  staleCount: number;
  recentOutcomeCount: number;
}): string {
  if (input.primaryFollowUp) {
    return `${statusLabel(input.primaryFollowUp.status)}: ${input.primaryFollowUp.title}`;
  }

  if (input.recentOutcomeCount > 0) {
    return "Son karar sonucu kayda alindi; acil takip bekleyen karar yok.";
  }

  if (input.overdueCount > 0 || input.staleCount > 0) {
    return "Karar takip listesi kontrol gerektiriyor.";
  }

  return "Acil karar takibi yok.";
}

export function buildAgendaRecommendation(
  primaryFollowUp: ExecutiveDecisionFollowUpItem | null,
): ExecutiveDecisionFollowUpAgendaRecommendation {
  if (!primaryFollowUp) {
    return {
      shouldRaise: false,
      status: null,
      title: null,
      reason: null,
      actionHint: null,
      urgency: null,
    };
  }

  const shouldRaise =
    primaryFollowUp.status === "OVERDUE" ||
    primaryFollowUp.status === "REAGENDA_REQUIRED";

  return {
    shouldRaise,
    status: primaryFollowUp.status,
    title: primaryFollowUp.title,
    reason: primaryFollowUp.reason,
    actionHint: primaryFollowUp.actionHint,
    urgency: primaryFollowUp.priority,
  };
}

export function buildFollowUpPromptSummary(input: {
  summaryLine: string;
  primaryFollowUp: ExecutiveDecisionFollowUpItem | null;
}): ExecutiveDecisionFollowUpPromptSummary {
  return {
    summaryLine: input.summaryLine,
    primaryStatus: input.primaryFollowUp?.status ?? null,
    primaryTitle: input.primaryFollowUp?.title ?? null,
    primaryActionHint: input.primaryFollowUp?.actionHint ?? null,
  };
}

function statusLabel(status: ExecutiveDecisionFollowUpStatus): string {
  const map: Record<ExecutiveDecisionFollowUpStatus, string> = {
    OPEN_PROPOSED: "Acik karar",
    AWAITING_RESULT: "Sonuc bekleniyor",
    OVERDUE: "Gecikmis karar",
    RESOLVED_SUCCESS: "Basarili sonuc",
    RESOLVED_FAILURE: "Basarisiz sonuc",
    ABANDONED: "Vazgecilen karar",
    REAGENDA_REQUIRED: "Yeniden gundem gerekli",
  };

  return map[status];
}
