import { describe, expect, it } from "vitest";

import type { DomainEvidenceV1 } from "../contracts";
import { buildCollectionComparisonPromptLine, buildCollectionComparisonResponse, projectCollectionComparisonTurnFact } from "../collection-comparison-turn";

const intent = { intent: "COLLECTION_COMPARISON", primaryPeriod: "CURRENT_MONTH", comparablePeriod: "PREVIOUS_MONTH" } as const;

function record(kind: "CURRENT_MONTH" | "PREVIOUS_MONTH", currency: string | null, net: number, extras: Partial<Record<"grossCollections" | "reversals" | "eventCount", number>> = {}): DomainEvidenceV1 {
  return {
    evidenceId: `${kind}:${currency ?? "ZERO"}`, evidenceType: "COLLECTION_PERIOD_SUMMARY", sourceDomain: "collection_events",
    sourceRecordId: `${kind}:${currency ?? "ZERO"}`, organizationId: "org-1", observedAt: "2026-09-15T09:00:00.000Z",
    verificationStatus: "CANONICAL", provenance: { owner: "CANONICAL_DOMAIN_RECORD", repository: "Settlement→CollectionsDataset→CollectionsManagementSummary" },
    adapterId: "collection-period-evidence", adapterVersion: "1.0", confidence: 0.98, summary: "canonical", managementCategory: "finance",
    projection: {
      periodKind: kind,
      periodLabel: kind === "CURRENT_MONTH" ? "Eylül 2026" : "Ağustos 2026",
      periodStart: kind === "CURRENT_MONTH" ? "2026-08-31T21:00:00.000Z" : "2026-07-31T21:00:00.000Z",
      periodEndExclusive: kind === "CURRENT_MONTH" ? "2026-09-15T09:00:00.000Z" : "2026-08-31T21:00:00.000Z",
      timeZone: "Europe/Istanbul", currency, currencies: currency ? [currency] : [],
      grossCollections: currency ? (extras.grossCollections ?? net) : null,
      reversals: currency ? (extras.reversals ?? 0) : null,
      netCollections: currency ? net : null,
      eventCount: currency ? (extras.eventCount ?? 1) : 0,
    },
  };
}

function comparison(current: number, previous: number) {
  return projectCollectionComparisonTurnFact(intent, [record("CURRENT_MONTH", "TRY", current), record("PREVIOUS_MONTH", "TRY", previous)])!;
}

describe("canonical collection comparison turn", () => {
  it.each([
    [12_000, 10_000, "UP", 2_000, 20],
    [7_500, 10_000, "DOWN", -2_500, -25],
    [10_000, 10_000, "UNCHANGED", 0, 0],
    [0, 10_000, "DOWN", -10_000, -100],
  ] as const)("computes factual direction and delta", (current, previous, direction, delta, percentage) => {
    expect(comparison(current, previous).currencies[0]).toMatchObject({ direction, absoluteDelta: delta, percentageChange: percentage });
  });

  it.each([[0, 0], [5_000, 0], [2_000, -1_000]] as const)("omits a misleading percentage for %s versus %s", (current, previous) => {
    expect(comparison(current, previous).currencies[0]!.percentageChange).toBeNull();
  });

  it("keeps currencies separate and fills an absent currency with known zero", () => {
    const fact = projectCollectionComparisonTurnFact(intent, [
      record("CURRENT_MONTH", "TRY", 4_000), record("CURRENT_MONTH", "USD", 500),
      record("PREVIOUS_MONTH", "TRY", 5_000), record("PREVIOUS_MONTH", "USD", 0),
    ])!;
    expect(fact.currencies.map((item) => item.currency)).toEqual(["TRY", "USD"]);
    expect(fact.currencies).toMatchObject([{ absoluteDelta: -1_000 }, { absoluteDelta: 500, percentageChange: null }]);
    expect(buildCollectionComparisonResponse(fact)).toContain("TRY tarafında");
    expect(buildCollectionComparisonResponse(fact)).toContain("USD tarafında");
  });

  it("represents two empty Settlement periods as affirmative zero truth", () => {
    const fact = projectCollectionComparisonTurnFact(intent, [record("CURRENT_MONTH", null, 0), record("PREVIOUS_MONTH", null, 0)])!;
    expect(fact.currencies).toEqual([]);
    expect(buildCollectionComparisonResponse(fact)).toContain("her iki dönemde de gerçekleşmiş tahsilat kaydı bulunmuyor");
  });

  it("carries gross, reversals, net and event count from canonical period summaries", () => {
    const fact = projectCollectionComparisonTurnFact(intent, [
      record("CURRENT_MONTH", "TRY", 4_000, { grossCollections: 5_000, reversals: -1_000, eventCount: 2 }),
      record("PREVIOUS_MONTH", "TRY", 3_000, { grossCollections: 3_000, reversals: 0, eventCount: 1 }),
    ])!;
    expect(fact.currencies[0]).toMatchObject({ primaryGross: 5_000, primaryReversals: -1_000, primaryNet: 4_000, primaryEventCount: 2 });
    expect(buildCollectionComparisonPromptLine(fact)).toContain("Payment and legacy financial-health calculations are not answer evidence");
  });

  it("states the partial-current versus complete-previous basis", () => {
    const fact = comparison(4_000, 5_000);
    expect(fact.comparisonBasis).toBe("PARTIAL_CURRENT_VS_COMPLETE_PREVIOUS");
    expect(buildCollectionComparisonResponse(fact)).toContain("şu ana kadarki");
    expect(buildCollectionComparisonResponse(fact)).toContain("tamamlanmış Ağustos 2026");
  });
});
