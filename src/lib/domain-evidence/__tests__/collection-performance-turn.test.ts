import { describe, expect, it } from "vitest";

import type { DomainEvidenceV1 } from "../contracts";
import { buildCollectionPerformancePromptLine, buildCollectionPerformanceResponse, projectCollectionPerformanceTurnFact } from "../collection-performance-turn";

function record(projection: Record<string, unknown>): DomainEvidenceV1 {
  return {
    evidenceId: "collection_events:test", evidenceType: "COLLECTION_PERIOD_SUMMARY", sourceDomain: "collection_events",
    sourceRecordId: "test", organizationId: "org-1", observedAt: "2026-09-01T09:00:00.000Z",
    verificationStatus: "CANONICAL", provenance: { owner: "CANONICAL_DOMAIN_RECORD", repository: "Settlement→CollectionsDataset→CollectionsManagementSummary" },
    adapterId: "collection-period-evidence", adapterVersion: "1.0", confidence: 0.98, summary: "test", projection, managementCategory: "finance",
  };
}

describe("ordinary-turn Settlement collection performance authority", () => {
  it("projects affirmative zero events without inventing a currency", () => {
    const fact = projectCollectionPerformanceTurnFact(
      { intent: "COLLECTION_PERFORMANCE", period: "CURRENT_MONTH" },
      [record({ periodKind: "CURRENT_MONTH", periodLabel: "Eylül 2026", periodStart: "2026-08-31T21:00:00.000Z", periodEndExclusive: "2026-09-01T09:00:00.000Z", timeZone: "Europe/Istanbul", currency: null, currencies: [], eventCount: 0 })],
    );
    expect(fact).toMatchObject({ eventCount: 0, currencies: [], label: "Eylül 2026" });
    expect(buildCollectionPerformancePromptLine(fact!)).toContain("Payment records are not answer evidence");
    expect(buildCollectionPerformanceResponse(fact!)).toContain("tahsilat kaydı bulunmuyor");
  });

  it("projects ORIGINAL and REVERSAL Settlement facts despite conflicting Payment context", () => {
    const fact = projectCollectionPerformanceTurnFact(
      { intent: "COLLECTION_PERFORMANCE", period: "CURRENT_MONTH" },
      [record({ periodKind: "CURRENT_MONTH", periodLabel: "Eylül 2026", periodStart: "2026-08-31T21:00:00.000Z", periodEndExclusive: "2026-09-15T09:00:00.000Z", timeZone: "Europe/Istanbul", currency: "TRY", grossCollections: 5_000, reversals: -1_000, netCollections: 4_000, eventCount: 2 })],
    );
    expect(fact).toMatchObject({ eventCount: 2, currencies: [{ currency: "TRY", grossCollections: 5_000, reversals: -1_000, netCollections: 4_000, eventCount: 2 }] });
    expect(buildCollectionPerformanceResponse(fact!)).toContain("net 4000");
  });

  it("does not accept evidence for a different period", () => {
    expect(projectCollectionPerformanceTurnFact(
      { intent: "COLLECTION_PERFORMANCE", period: "PREVIOUS_MONTH" },
      [record({ periodKind: "CURRENT_MONTH" })],
    )).toBeNull();
  });
});
