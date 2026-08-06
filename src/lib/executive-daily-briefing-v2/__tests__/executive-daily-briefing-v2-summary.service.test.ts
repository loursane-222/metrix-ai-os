import { describe, expect, it } from "vitest";

import {
  DEFAULT_HEADLINE,
  buildExecutiveDailyBriefingFirstAction,
  buildExecutiveDailyBriefingHeadline,
} from "../executive-daily-briefing-v2-summary.service";

const briefingPackage = { kritikItems: [], dikkatItems: [] } as never;

function contextWith(evidence: Record<string, unknown>) {
  return {
    executiveRhythm: null,
    executiveAlerts: null,
    executiveDecisionContext: {
      openDecisions: [],
      overdueCommittedDecision: null,
      latestOutcome: null,
      ...evidence,
    },
  } as never;
}

describe("executive daily briefing canonical evidence invariant", () => {
  it.each([
    ["priority", {
      executiveRhythm: { priorities: [{ headline: "Tahsilatı tamamla", focus: "Nakit", actionHint: "Ara", source: "payment" }] },
      executiveDecisionContext: { openDecisions: [], overdueCommittedDecision: null, latestOutcome: null },
    }],
    ["critical alert", {
      executiveAlerts: { criticalAlerts: [{ headline: "Vade aşıldı", actionableStep: "Takip et" }] },
      executiveDecisionContext: { openDecisions: [], overdueCommittedDecision: null, latestOutcome: null },
    }],
    ["overdue decision", contextWith({ overdueCommittedDecision: { title: "Fiyat kararını kapat", actionHint: null } })],
    ["open decision", contextWith({ openDecisions: [{ title: "Yeni teklifi onayla", rationale: "Müşteri bekliyor", actionHint: "Kararı ver" }] })],
    ["latest outcome", contextWith({ latestOutcome: { decisionTitle: "Kampanya", outcome: "SUCCESS", summary: "Hedef aşıldı" } })],
  ])("never returns the generic headline when %s is canonical evidence", (_name, operatingContext) => {
    const headline = buildExecutiveDailyBriefingHeadline({ briefingPackage, operatingContext: operatingContext as never });
    expect(headline).not.toBe(DEFAULT_HEADLINE);
  });

  it("uses an open decision in both the headline and first action", () => {
    const operatingContext = contextWith({
      openDecisions: [{ title: "Yeni teklifi onayla", rationale: "Müşteri bekliyor", actionHint: "Kararı ver" }],
    });

    expect(buildExecutiveDailyBriefingHeadline({ briefingPackage, operatingContext }))
      .toContain("Yeni teklifi onayla");
    expect(buildExecutiveDailyBriefingFirstAction({ briefingPackage, operatingContext }))
      .toMatchObject({ title: "Yeni teklifi onayla", source: "Karar takibi" });
  });

  it("uses the latest outcome in both the headline and first action", () => {
    const operatingContext = contextWith({
      latestOutcome: { decisionTitle: "Kampanya", outcome: "SUCCESS", summary: "Hedef aşıldı" },
    });

    expect(buildExecutiveDailyBriefingHeadline({ briefingPackage, operatingContext }))
      .toContain("Kampanya");
    expect(buildExecutiveDailyBriefingFirstAction({ briefingPackage, operatingContext }))
      .toMatchObject({ title: "Kampanya", source: "Karar sonucu" });
  });
});
