import { describe, expect, it } from "vitest";
import type { DomainEvidenceV1 } from "../contracts";
import { buildCollectionDriversResponse, buildCollectionTargetResponse, projectCollectionDriversTurnFact, projectCollectionTargetTurnFact } from "../collection-drivers-target-turn";

const driverIntent = { intent: "COLLECTION_DRIVERS", primaryPeriod: "CURRENT_MONTH", comparablePeriod: "PREVIOUS_MONTH" } as const;
const targetIntent = { intent: "COLLECTION_TARGET_POSITION", period: "CURRENT_MONTH" } as const;

function period(kind: "CURRENT_MONTH" | "PREVIOUS_MONTH", currency: string | null, gross: number, reversals: number, customers: Record<string, number> = {}): DomainEvidenceV1 {
  const net = gross + reversals;
  return { evidenceId: `${kind}:${currency}`, evidenceType: "COLLECTION_PERIOD_SUMMARY", sourceDomain: "collection_events", sourceRecordId: `${kind}:${currency}`, organizationId: "org-1", observedAt: "2026-09-15T09:00:00.000Z", verificationStatus: "CANONICAL", provenance: { owner: "CANONICAL_DOMAIN_RECORD", repository: "Settlement→CollectionsDataset→CollectionsManagementSummary" }, adapterId: "collection-period-evidence", adapterVersion: "1.0", confidence: 0.98, summary: "canonical", managementCategory: "finance", projection: { periodKind: kind, periodLabel: kind === "CURRENT_MONTH" ? "Eylül 2026" : "Ağustos 2026", periodStart: kind === "CURRENT_MONTH" ? "2026-08-31T21:00:00.000Z" : "2026-07-31T21:00:00.000Z", periodEndExclusive: kind === "CURRENT_MONTH" ? "2026-09-15T09:00:00.000Z" : "2026-08-31T21:00:00.000Z", timeZone: "Europe/Istanbul", currency, grossCollections: currency ? gross : null, reversals: currency ? reversals : null, netCollections: currency ? net : null, eventCount: currency ? Object.keys(customers).length || 1 : 0, customerContributions: Object.entries(customers).map(([customerName, netAmount]) => ({ customerName, netAmount })) } };
}

function goal(overrides: Record<string, unknown> = {}): DomainEvidenceV1 {
  return { evidenceId: "goals:goal-1", evidenceType: "GOAL_RECORD", sourceDomain: "goals", sourceRecordId: "goal-1", organizationId: "org-1", observedAt: "2026-09-01T00:00:00.000Z", verificationStatus: "CANONICAL", provenance: { owner: "CANONICAL_DOMAIN_RECORD", repository: "SalesGoal" }, adapterId: "goal-evidence", adapterVersion: "1.0", confidence: 0.9, summary: "goal", managementCategory: "sales", projection: { title: "Aylık tahsilat", period: "MONTHLY", goalType: "COLLECTION", currency: "TRY", targetCollectionCents: "12000000", startsAt: "2026-08-31T21:00:00.000Z", endsAt: "2026-09-30T21:00:00.000Z", ...overrides } };
}

describe("collection drivers", () => {
  it("reconciles gross, reversal, customer and net deltas without causal invention", () => {
    const fact = projectCollectionDriversTurnFact(driverIntent, [
      period("CURRENT_MONTH", "TRY", 60_000, -10_000, { "Atlas A.Ş.": 30_000, "Beta A.Ş.": 25_000, "Bilinmeyen müşteri": -5_000 }),
      period("PREVIOUS_MONTH", "TRY", 100_000, -5_000, { "Atlas A.Ş.": 80_000, "Beta A.Ş.": 20_000, "Bilinmeyen müşteri": -5_000 }),
    ])!;
    expect(fact.currencies[0]).toMatchObject({ grossDelta: -40_000, reversalDelta: -5_000, netDelta: -45_000, unattributedDelta: 0, reconciled: true });
    expect(fact.currencies[0]!.customerContributions[0]).toMatchObject({ customerName: "Atlas A.Ş.", absoluteDelta: -50_000, direction: "DECREASED" });
    const response = buildCollectionDriversResponse(fact);
    expect(response).toContain("operasyonel neden kanıtlanmış değildir");
    expect(response).not.toMatch(/ödemeyi geciktirdi|aksiyon başarısız|çalışan/iu);
  });

  it.each([
    [10_000, 0, 20_000, 0, -10_000],
    [20_000, -5_000, 20_000, 0, -5_000],
    [20_000, -5_000, 30_000, -2_000, -13_000],
    [0, 0, 0, 0, 0],
    [10_000, 0, 0, 0, 10_000],
    [0, -2_000, 0, -1_000, -1_000],
  ] as const)("reconciles arithmetic scenarios", (currentGross, currentReversals, previousGross, previousReversals, expected) => {
    const fact = projectCollectionDriversTurnFact(driverIntent, [period("CURRENT_MONTH", "TRY", currentGross, currentReversals, { Atlas: currentGross + currentReversals }), period("PREVIOUS_MONTH", "TRY", previousGross, previousReversals, { Atlas: previousGross + previousReversals })])!;
    expect(fact.currencies[0]).toMatchObject({ netDelta: expected, reconciled: true });
  });

  it("keeps currencies and unattributed contribution separate", () => {
    const fact = projectCollectionDriversTurnFact(driverIntent, [period("CURRENT_MONTH", "TRY", 5_000, 0, { "Bilinmeyen müşteri": 5_000 }), period("PREVIOUS_MONTH", "TRY", 0, 0), period("CURRENT_MONTH", "USD", 100, 0, { Atlas: 100 }), period("PREVIOUS_MONTH", "USD", 50, 0, { Atlas: 50 })])!;
    expect(fact.currencies.map((item) => item.currency)).toEqual(["TRY", "USD"]);
    expect(fact.currencies[0]!.unattributedDelta).toBe(5_000);
  });

  it("does not turn Payment state or collection actions into a cause", () => {
    const irrelevant: DomainEvidenceV1[] = [
      { ...period("CURRENT_MONTH", "TRY", 5_000, 0, { Atlas: 5_000 }), evidenceId: "payments:p-1", evidenceType: "PAYMENT_RECORD", sourceDomain: "payments", sourceRecordId: "p-1", projection: { status: "OVERDUE", paidAmount: 99_999 } },
      { ...period("CURRENT_MONTH", "TRY", 5_000, 0, { Atlas: 5_000 }), evidenceId: "collections:a-1", evidenceType: "COLLECTION_RECORD", sourceDomain: "collections", sourceRecordId: "a-1", projection: { status: "OPEN", actionType: "FOLLOW_UP" } },
    ];
    const fact = projectCollectionDriversTurnFact(driverIntent, [period("CURRENT_MONTH", "TRY", 5_000, 0, { Atlas: 5_000 }), period("PREVIOUS_MONTH", "TRY", 10_000, 0, { Atlas: 10_000 }), ...irrelevant])!;
    const response = buildCollectionDriversResponse(fact);
    expect(response).not.toMatch(/OVERDUE|FOLLOW_UP|aksiyon başarısız|geciktirdi/iu);
  });
});

describe("collection target position", () => {
  it("uses Settlement actual, exact currency, period and COLLECTION goal", () => {
    const fact = projectCollectionTargetTurnFact(targetIntent, [period("CURRENT_MONTH", "TRY", 80_000, 0, { Atlas: 80_000 }), period("CURRENT_MONTH", "USD", 500, 0, { Atlas: 500 }), goal()])!;
    expect(fact.positions).toEqual([expect.objectContaining({ currency: "TRY", targetAmount: 120_000, actualAmount: 80_000, absoluteGap: 40_000, status: "TARGET_NOT_REACHED", attainmentPercentage: 66.67 })]);
    expect(buildCollectionTargetResponse(fact)).toContain("40.000 TRY daha gerekiyor");
  });

  it("treats missing goal as missing, not zero", () => {
    const fact = projectCollectionTargetTurnFact(targetIntent, [period("CURRENT_MONTH", "TRY", 0, 0)])!;
    expect(fact).toMatchObject({ goalStatus: "GOAL_NOT_DEFINED", positions: [] });
    expect(buildCollectionTargetResponse(fact)).toContain("hedefi tanımlı değil");
  });

  it("rejects wrong goal type, currency blending, mismatched period, and handles zero target safely", () => {
    const records = [period("CURRENT_MONTH", "TRY", 5_000, 0), goal({ goalType: "REVENUE" }), goal({ period: "YEARLY" }), goal({ targetCollectionCents: "0", currency: "USD" })];
    const fact = projectCollectionTargetTurnFact(targetIntent, records)!;
    expect(fact.positions).toEqual([expect.objectContaining({ currency: "USD", actualAmount: 0, attainmentPercentage: null, status: "TARGET_REACHED" })]);
  });

  it("ignores Payment rollups and goals outside the requested period", () => {
    const payment = { ...period("CURRENT_MONTH", "TRY", 50_000, 0), evidenceId: "payments:p-1", evidenceType: "PAYMENT_RECORD" as const, sourceDomain: "payments", sourceRecordId: "p-1", projection: { status: "PAID", paidAmount: 999_999, paidAt: "2026-09-01T00:00:00.000Z" } };
    const fact = projectCollectionTargetTurnFact(targetIntent, [period("CURRENT_MONTH", "TRY", 0, 0), payment, goal({ startsAt: "2026-07-31T21:00:00.000Z", endsAt: "2026-08-31T21:00:00.000Z" })])!;
    expect(fact).toMatchObject({ goalStatus: "GOAL_NOT_DEFINED", positions: [] });
  });
});
