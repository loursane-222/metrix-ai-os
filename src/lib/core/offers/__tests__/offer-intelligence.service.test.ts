import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  quoteFindFirst: vi.fn(), quoteFindMany: vi.fn(), quoteGroupBy: vi.fn(),
  eventCount: vi.fn(), eventFindFirst: vi.fn(), counterCount: vi.fn(), paymentAggregate: vi.fn(), paymentCount: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {
  quote: { findFirst: mocks.quoteFindFirst, findMany: mocks.quoteFindMany, groupBy: mocks.quoteGroupBy },
  quoteEvent: { count: mocks.eventCount, findFirst: mocks.eventFindFirst },
  quoteCounterProposal: { count: mocks.counterCount }, payment: { aggregate: mocks.paymentAggregate, count: mocks.paymentCount },
} }));

import { buildCustomerDecisionScorecard, computeOfferIntelligence } from "../offer-intelligence.service";

describe("offer intelligence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts real view events and overdue payments without fabricating win probability", async () => {
    mocks.quoteFindFirst.mockResolvedValue({ id: "quote-1", customerId: "customer-1" });
    mocks.eventCount.mockResolvedValue(3);
    mocks.eventFindFirst.mockResolvedValue({ createdAt: new Date("2026-08-09T12:00:00Z") });
    mocks.counterCount.mockResolvedValue(2);
    mocks.quoteFindMany.mockResolvedValue([{ status: "WON" }]);
    mocks.paymentAggregate.mockResolvedValue({ _count: { _all: 2 }, _sum: { amount: { toString: () => "500.00" } } });
    mocks.paymentCount.mockResolvedValue(4);
    mocks.quoteGroupBy.mockResolvedValue([{ customerId: "customer-1", _sum: { amount: 12000 } }, { customerId: "customer-2", _sum: { amount: 8000 } }]);

    const result = await computeOfferIntelligence("quote-1", "org-1");

    expect(result?.customerInterest).toEqual({ viewCount: 3, lastViewedAt: "2026-08-09T12:00:00.000Z" });
    expect(result?.negotiationDifficulty.rounds).toBe(2);
    expect(result?.winProbability).toBeNull();
    expect(result?.financialRisk).toMatchObject({ overdueCount: 2, overdueAmount: "500.00", score: 50 });
    expect(result?.executiveScore.components.map((c) => c.dimension)).toEqual(
      expect.arrayContaining(["Müşteri İlgisi", "Pazarlık Kolaylığı", "Finansal Risk"]),
    );
  });

  it("does not fabricate a hot score from zero real activity (regression: 0 views/0 rounds/no payment history used to average out to a near-perfect score)", async () => {
    mocks.quoteFindFirst.mockResolvedValue({ id: "quote-2", customerId: "customer-2" });
    mocks.eventCount.mockResolvedValue(0);
    mocks.eventFindFirst.mockResolvedValue(null);
    mocks.counterCount.mockResolvedValue(0);
    mocks.quoteFindMany.mockResolvedValue([]);
    mocks.paymentAggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { amount: null } });
    mocks.paymentCount.mockResolvedValue(0);
    mocks.quoteGroupBy.mockResolvedValue([]);

    const result = await computeOfferIntelligence("quote-2", "org-1");

    const dimensions = result?.executiveScore.components.map((c) => c.dimension) ?? [];
    expect(dimensions).not.toContain("Pazarlık Kolaylığı");
    expect(dimensions).not.toContain("Finansal Risk");
    expect(result?.executiveScore.score).toBe(0);
    expect(result?.executiveScore.heat).toBe("Soğuk");
  });

  it("returns an entirely insufficient scorecard below two decided quotes", () => {
    expect(buildCustomerDecisionScorecard({ decidedQuotes: [{ status: "WON", sentAt: null, wonAt: null, lostAt: null, negotiationRounds: 0 }], contestedTerms: [] })).toEqual({ sufficientData: false, sampleSize: 1, message: "Yetersiz veri — henüz yeterli teklif geçmişi yok" });
  });

  it("derives win rate and the dominant contested term from actual proposal fields", () => {
    const result = buildCustomerDecisionScorecard({
      decidedQuotes: [
        { status: "WON", sentAt: new Date("2026-08-01"), wonAt: new Date("2026-08-03"), lostAt: null, negotiationRounds: 2 },
        { status: "LOST", sentAt: new Date("2026-08-01"), wonAt: null, lostAt: new Date("2026-08-05"), negotiationRounds: 1 },
      ],
      contestedTerms: [
        { proposedAmount: true, proposedPaymentTerm: false, proposedDeliveryTerm: false },
        { proposedAmount: true, proposedPaymentTerm: true, proposedDeliveryTerm: false },
      ],
    });
    expect(result).toMatchObject({ sufficientData: true, winRate: 50, avgDecisionDays: 3, avgNegotiationRounds: 1.5, dominantContestedTerm: "Fiyat Odaklı" });
  });
});
