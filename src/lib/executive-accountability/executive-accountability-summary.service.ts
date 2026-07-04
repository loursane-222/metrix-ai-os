import type {
  ExecutiveAccountabilityAlert,
  ExecutiveAccountabilityItem,
  ExecutiveAccountabilityPromptSummary,
  ExecutiveAccountabilityReminderPolicy,
} from "./executive-accountability.types";

const MAX_PROMPT_ALERTS = 3;

export function buildAccountabilitySummaryLine(input: {
  primaryIssue: ExecutiveAccountabilityItem | null;
  overdueCount: number;
  missingOwnerCount: number;
  upcomingDeadlineCount: number;
  alertCount: number;
}): string {
  if (input.primaryIssue) {
    if (input.primaryIssue.daysOverdue !== null && input.primaryIssue.daysOverdue > 0) {
      return `Gecikmiş taahhüt: ${input.primaryIssue.title}`;
    }

    if (input.primaryIssue.needsClarification) {
      return `Sorumlusu netleşmesi gereken taahhüt: ${input.primaryIssue.title}`;
    }

    return `Takipteki taahhüt: ${input.primaryIssue.title}`;
  }

  if (input.alertCount > 0) {
    return "Son karar sonuçlarından takip gerektiren sinyal var.";
  }

  if (input.upcomingDeadlineCount > 0) {
    return "Yaklaşan taahhüt takibi var; şimdilik yumuşak izleme yeterli.";
  }

  if (input.missingOwnerCount > 0) {
    return "Bazı kararların sorumlusu net değil; uygun anda tek soruyla netleştir.";
  }

  if (input.overdueCount > 0) {
    return "Gecikmiş taahhüt var; sonucu netleştir.";
  }

  return "Acil hesap verebilirlik baskısı yok.";
}

export function buildPrimaryIssueLine(
  item: ExecutiveAccountabilityItem | null,
): string | null {
  if (!item) return null;

  if (item.daysOverdue !== null && item.daysOverdue > 0) {
    return `${item.title}: ${item.daysOverdue} gündür sonuç bekliyor.`;
  }

  if (item.dueAt) {
    return `${item.title}: ${item.dueAt} tarihine kadar takipte.`;
  }

  return `${item.title}: sorumlu ve sonuç beklentisi netleştirilmeli.`;
}

export function buildAccountabilityPromptSummary(input: {
  summaryLine: string;
  primaryIssue: ExecutiveAccountabilityItem | null;
  overdueCount: number;
  missingOwnerCount: number;
  upcomingDeadlineCount: number;
  alerts: ExecutiveAccountabilityAlert[];
}): ExecutiveAccountabilityPromptSummary {
  return {
    summaryLine: input.summaryLine,
    primaryIssueLine: buildPrimaryIssueLine(input.primaryIssue),
    reminderPolicy: input.primaryIssue?.reminderPolicy ?? "SILENT",
    overdueCount: input.overdueCount,
    missingOwnerCount: input.missingOwnerCount,
    upcomingDeadlineCount: input.upcomingDeadlineCount,
    alertLines: input.alerts.slice(0, MAX_PROMPT_ALERTS).map((alert) => alert.line),
    clarifyingQuestion: input.primaryIssue?.clarifyingQuestion ?? null,
  };
}

export function mostUrgentReminderPolicy(
  items: ExecutiveAccountabilityItem[],
): ExecutiveAccountabilityReminderPolicy {
  if (items.some((item) => item.reminderPolicy === "ESCALATE")) return "ESCALATE";
  if (items.some((item) => item.reminderPolicy === "ASK_DIRECTLY")) return "ASK_DIRECTLY";
  if (items.some((item) => item.reminderPolicy === "ASK_SOFTLY")) return "ASK_SOFTLY";
  return "SILENT";
}
