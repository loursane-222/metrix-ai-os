import type { ExecutiveActionOutcomeStatus } from "./executive-action.types";

export type CompletedActionOutcomeInput = {
  id: string;
  title: string;
  outcomeStatus: ExecutiveActionOutcomeStatus | null;
  resultSummary: string | null;
  completedAt: Date | null;
};

export type ExecutiveActionOutcomeSummary = {
  totalCompleted: number;
  successCount: number;
  partialCount: number;
  failedCount: number;
  unknownCount: number;
  latestTitle: string | null;
  latestOutcomeStatus: ExecutiveActionOutcomeStatus | null;
  summaryLine: string;
};

export function buildExecutiveActionOutcomeSummary(
  actions: CompletedActionOutcomeInput[],
): ExecutiveActionOutcomeSummary {
  if (actions.length === 0) {
    return {
      totalCompleted: 0,
      successCount: 0,
      partialCount: 0,
      failedCount: 0,
      unknownCount: 0,
      latestTitle: null,
      latestOutcomeStatus: null,
      summaryLine: "Son 7 günde tamamlanan aksiyon kaydı yok.",
    };
  }

  const successCount = actions.filter((a) => a.outcomeStatus === "SUCCESS").length;
  const partialCount = actions.filter((a) => a.outcomeStatus === "PARTIAL").length;
  const failedCount  = actions.filter((a) => a.outcomeStatus === "FAILED").length;
  const unknownCount = actions.filter(
    (a) => a.outcomeStatus === "UNKNOWN" || a.outcomeStatus === null,
  ).length;

  const latest = actions[0];

  return {
    totalCompleted: actions.length,
    successCount,
    partialCount,
    failedCount,
    unknownCount,
    latestTitle: latest?.title ?? null,
    latestOutcomeStatus: latest?.outcomeStatus ?? null,
    summaryLine: buildSummaryLine(actions.length, successCount, failedCount),
  };
}

function buildSummaryLine(total: number, success: number, failed: number): string {
  if (success === total) {
    return `Son 7 günde ${total} aksiyon başarıyla tamamlandı.`;
  }

  const parts: string[] = [`Son 7 günde ${total} aksiyon tamamlandı`];
  if (success > 0) parts.push(`${success} başarılı`);
  if (failed > 0)  parts.push(`${failed} başarısız`);
  return parts.join("; ") + ".";
}
