import { describe, expect, it } from "vitest";

import type { ExecutiveDailyBriefingV2 } from "@/lib/executive-daily-briefing-v2";
import { buildDailyBriefingCardRows } from "../dailyBriefingCardRows";

function briefing(overrides: Partial<ExecutiveDailyBriefingV2>): ExecutiveDailyBriefingV2 {
  return {
    topPriorities: [],
    criticalAlerts: [],
    watchSignals: [],
    decisionFollowUps: {
      openDecisions: [],
      overdueCommittedDecision: null,
      latestOutcome: null,
    },
    ...overrides,
  } as ExecutiveDailyBriefingV2;
}

describe("daily briefing card rows", () => {
  it("deduplicates repeated open-decision titles", () => {
    const repeated = {
      title: "Tahsilat kararını netleştir",
      reason: "Finance signals show payment or cash exposure. The executive decision should protect cash first, then decide whether new commercial exposure is acceptable.",
      actionHint: "Get a written payment date and amount before accepting new exposure.",
      dueAt: null,
      priority: "Yüksek",
    };
    const result = buildDailyBriefingCardRows(briefing({
      decisionFollowUps: { openDecisions: [repeated, repeated], overdueCommittedDecision: null, latestOutcome: null },
    }));

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.title).toBe(repeated.title);
    expect(result.rows[0]?.detail).toBe("Finans sinyalleri ödeme veya nakit riski gösteriyor. Yönetim kararı önce nakdi korumalı, ardından yeni ticari riskin kabul edilip edilemeyeceğini belirlemeli.");
    expect(result.rows[0]?.action).toBe("Yeni risk almadan önce yazılı ödeme tarihi ve tutarı al.");
  });

  it("orders urgent evidence first and limits the card to five rows", () => {
    const result = buildDailyBriefingCardRows(briefing({
      criticalAlerts: Array.from({ length: 2 }, (_, index) => ({ title: `Uyarı ${index}`, severity: "Kritik", actionHint: null, source: "Yönetim uyarısı" })),
      topPriorities: Array.from({ length: 3 }, (_, index) => ({ rank: (index + 1) as 1 | 2 | 3, title: `Öncelik ${index}`, focus: "Odak", actionHint: null, urgency: "Bugün", source: "Ritim" })),
      watchSignals: [{ title: "İzleme", reason: "Takip", actionHint: null, source: "Tahmin" }],
      decisionFollowUps: {
        openDecisions: [{ title: "Açık karar", reason: "Gerekçe", actionHint: null, dueAt: null, priority: null }],
        overdueCommittedDecision: { title: "Geciken karar", reason: "Gerekçe", actionHint: null, dueAt: null, priority: "Kritik" },
        latestOutcome: { decisionTitle: "Sonuç", outcome: "Başarılı", summary: null, occurredAt: "2026-08-06T00:00:00Z" },
      },
    }));

    expect(result.rows).toHaveLength(5);
    expect(result.rows.map((row) => row.kind)).toEqual([
      "Geciken karar", "Kritik uyarı", "Kritik uyarı", "Öncelik", "Öncelik",
    ]);
    expect(result.hiddenCount).toBe(4);
  });
});
