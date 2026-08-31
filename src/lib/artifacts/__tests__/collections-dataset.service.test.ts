import { describe, expect, it, vi } from "vitest";

const listCollectionEventsInRange = vi.hoisted(() => vi.fn());
vi.mock("@/lib/core/settlements/settlement.service", () => ({ listCollectionEventsInRange }));

import { buildCollectionsDataset } from "../datasets/collections-dataset.service";

const augustPeriod = { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z"), label: "Ağustos 2026", isoLabel: "2026-08" };
const septemberPeriod = { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-10-01T00:00:00Z"), label: "Eylül 2026", isoLabel: "2026-09" };

function settlementEvent(overrides: Record<string, unknown>) {
  return {
    id: "s1",
    direction: "IN",
    kind: "ORIGINAL",
    amount: "1000",
    currency: "TRY",
    occurredAt: new Date("2026-08-10T00:00:00Z"),
    payment: { title: "Fatura ödemesi", customer: { displayName: "Atlas İnşaat" }, invoice: null },
    ...overrides,
  };
}

describe("buildCollectionsDataset — canonical Settlement-event grain", () => {
  it("maps a real collection Settlement into a positively-signed row, never reading Payment.paidAmount/paidAt", async () => {
    listCollectionEventsInRange.mockResolvedValueOnce([settlementEvent({})]);
    const dataset = await buildCollectionsDataset("org-1", augustPeriod);
    expect(listCollectionEventsInRange).toHaveBeenCalledWith("org-1", { from: augustPeriod.from, to: augustPeriod.to });
    expect(dataset.records[0]).toMatchObject({ amount: 1000, kind: "ORIGINAL", customerName: "Atlas İnşaat" });
  });

  it("maps a REVERSAL Settlement into a negatively-signed row, distinct from the original", async () => {
    listCollectionEventsInRange.mockResolvedValueOnce([
      settlementEvent({ id: "s1", direction: "IN", kind: "ORIGINAL", amount: "3000" }),
      settlementEvent({ id: "s2", direction: "OUT", kind: "REVERSAL", amount: "3000", occurredAt: new Date("2026-08-15T00:00:00Z") }),
    ]);
    const dataset = await buildCollectionsDataset("org-1", augustPeriod);
    expect(dataset.recordCount).toBe(2);
    expect(dataset.records[0]).toMatchObject({ amount: 3000, kind: "ORIGINAL" });
    expect(dataset.records[1]).toMatchObject({ amount: -3000, kind: "REVERSAL" });
    // A reversal in the same period as its original nets the period total
    // to zero — subtracted exactly once, never twice.
    expect(dataset.totalsByCurrency.TRY).toBe(0);
  });

  it("period semantics: a partially-settled Payment's real collections appear in their own real months, never depending on Payment.paidAt/paidAmount", async () => {
    // The proven scenario: 10,000 TL owed, 3,000 TL collected Aug 10, 2,000
    // TL collected Sep 5, still 5,000 outstanding — Payment.paidAt stays
    // null forever in this scenario (settlement.service.ts's own logic),
    // yet each real collection must still appear in its own period.
    listCollectionEventsInRange.mockImplementationOnce(async (_org: string, range: { from: Date; to: Date }) => {
      const augustEvent = settlementEvent({ id: "aug", amount: "3000", occurredAt: new Date("2026-08-10T00:00:00Z") });
      return range.from.getTime() === augustPeriod.from.getTime() ? [augustEvent] : [];
    });
    const august = await buildCollectionsDataset("org-1", augustPeriod);
    expect(august.recordCount).toBe(1);
    expect(august.totalsByCurrency.TRY).toBe(3000);

    listCollectionEventsInRange.mockImplementationOnce(async (_org: string, range: { from: Date; to: Date }) => {
      const septemberEvent = settlementEvent({ id: "sep", amount: "2000", occurredAt: new Date("2026-09-05T00:00:00Z") });
      return range.from.getTime() === septemberPeriod.from.getTime() ? [septemberEvent] : [];
    });
    const september = await buildCollectionsDataset("org-1", septemberPeriod);
    expect(september.recordCount).toBe(1);
    expect(september.totalsByCurrency.TRY).toBe(2000);
  });

  it("multiple settlements against one Payment remain distinct, correctly-dated events", async () => {
    listCollectionEventsInRange.mockResolvedValueOnce([
      settlementEvent({ id: "s1", amount: "3000", occurredAt: new Date("2026-08-03T00:00:00Z") }),
      settlementEvent({ id: "s2", amount: "1500", occurredAt: new Date("2026-08-22T00:00:00Z") }),
    ]);
    const dataset = await buildCollectionsDataset("org-1", augustPeriod);
    expect(dataset.recordCount).toBe(2);
    expect(dataset.records.map((r) => r.amount)).toEqual([3000, 1500]);
    expect(dataset.totalsByCurrency.TRY).toBe(4500);
  });

  it("sums totals per currency deterministically, never mixing currencies into one number", async () => {
    listCollectionEventsInRange.mockResolvedValueOnce([
      settlementEvent({ id: "s1", amount: "100", currency: "TRY" }),
      settlementEvent({ id: "s2", amount: "50", currency: "TRY" }),
      settlementEvent({ id: "s3", amount: "30", currency: "USD" }),
    ]);
    const dataset = await buildCollectionsDataset("org-1", augustPeriod);
    expect(dataset.totalsByCurrency).toEqual({ TRY: 150, USD: 30 });
  });

  it("returns an honest empty dataset when there are no Settlement events — never invents rows", async () => {
    listCollectionEventsInRange.mockResolvedValueOnce([]);
    const dataset = await buildCollectionsDataset("org-1", augustPeriod);
    expect(dataset.recordCount).toBe(0);
    expect(dataset.records).toEqual([]);
    expect(dataset.totalsByCurrency).toEqual({});
  });
});
