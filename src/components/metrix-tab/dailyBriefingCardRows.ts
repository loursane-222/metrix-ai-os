import type { ExecutiveDailyBriefingV2 } from "@/lib/executive-daily-briefing-v2";

export type DailyBriefingCardRow = {
  kind: string;
  title: string;
  detail: string;
  action: string | null;
  source: string;
};

const MAX_CARD_ROWS = 5;

export function buildDailyBriefingCardRows(briefing: ExecutiveDailyBriefingV2): {
  rows: DailyBriefingCardRow[];
  hiddenCount: number;
} {
  const openDecisions = uniqueByTitle(briefing.decisionFollowUps.openDecisions);
  const candidates: DailyBriefingCardRow[] = [
    ...(briefing.decisionFollowUps.overdueCommittedDecision
      ? [{
          kind: "Geciken karar",
          title: briefing.decisionFollowUps.overdueCommittedDecision.title,
          detail: turkishDecisionText(briefing.decisionFollowUps.overdueCommittedDecision.reason),
          action: turkishDecisionText(briefing.decisionFollowUps.overdueCommittedDecision.actionHint),
          source: "Karar takibi",
        }]
      : []),
    ...briefing.criticalAlerts.map((item) => ({
      kind: "Kritik uyarı",
      title: item.title,
      detail: item.severity,
      action: item.actionHint,
      source: item.source,
    })),
    ...briefing.topPriorities.map((item) => ({
      kind: "Öncelik",
      title: item.title,
      detail: item.focus,
      action: item.actionHint,
      source: item.source,
    })),
    ...openDecisions.map((item) => ({
      kind: "Açık karar",
      title: item.title,
      detail: turkishDecisionText(item.reason),
      action: turkishDecisionText(item.actionHint),
      source: "Karar takibi",
    })),
    ...briefing.watchSignals
      .filter((item) => item.title !== "İzlenecek yeni kritik sinyal yok." && item.title !== "Izlenecek yeni kritik sinyal yok.")
      .map((item) => ({
        kind: "İzleme",
        title: item.title,
        detail: item.reason,
        action: item.actionHint,
        source: item.source,
      })),
    ...(briefing.decisionFollowUps.latestOutcome
      ? [{
          kind: "Karar sonucu",
          title: briefing.decisionFollowUps.latestOutcome.decisionTitle,
          detail: briefing.decisionFollowUps.latestOutcome.summary
            ?? briefing.decisionFollowUps.latestOutcome.outcome,
          action: null,
          source: "Karar takibi",
        }]
      : []),
  ];

  return {
    rows: candidates.slice(0, MAX_CARD_ROWS),
    hiddenCount: Math.max(0, candidates.length - MAX_CARD_ROWS),
  };
}

const LEGACY_DECISION_TRANSLATIONS: Readonly<Record<string, string>> = {
  "Finance signals show payment or cash exposure. The executive decision should protect cash first, then decide whether new commercial exposure is acceptable.":
    "Finans sinyalleri ödeme veya nakit riski gösteriyor. Yönetim kararı önce nakdi korumalı, ardından yeni ticari riskin kabul edilip edilemeyeceğini belirlemeli.",
  "Get a written payment date and amount before accepting new exposure.":
    "Yeni risk almadan önce yazılı ödeme tarihi ve tutarı al.",
  "Strategic profile has too many missing signals, so executive decisions should first improve strategy visibility.":
    "Stratejik profilde çok fazla eksik sinyal var; bu nedenle yönetim kararları önce strateji görünürlüğünü artırmalıdır.",
  "Capture the current top goal.": "Mevcut en önemli hedefi kaydet.",
};

function turkishDecisionText(value: string): string;
function turkishDecisionText(value: null): null;
function turkishDecisionText(value: string | null): string | null;
function turkishDecisionText(value: string | null): string | null {
  if (!value) return value;
  return LEGACY_DECISION_TRANSLATIONS[value] ?? value;
}

function uniqueByTitle<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.trim().toLocaleLowerCase("tr-TR");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
