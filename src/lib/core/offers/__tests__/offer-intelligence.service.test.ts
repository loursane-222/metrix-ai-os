import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  quoteFindFirst: vi.fn(), quoteFindMany: vi.fn(), quoteGroupBy: vi.fn(),
  eventCount: vi.fn(), eventFindFirst: vi.fn(), counterCount: vi.fn(), paymentAggregate: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {
  quote: { findFirst: mocks.quoteFindFirst, findMany: mocks.quoteFindMany, groupBy: mocks.quoteGroupBy },
  quoteEvent: { count: mocks.eventCount, findFirst: mocks.eventFindFirst },
  quoteCounterProposal: { count: mocks.counterCount }, payment: { aggregate: mocks.paymentAggregate },
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
    mocks.quoteGroupBy.mockResolvedValue([{ customerId: "customer-1", _sum: { amount: 12000 } }, { customerId: "customer-2", _sum: { amount: 8000 } }]);

    const result = await computeOfferIntelligence("quote-1", "org-1");

    expect(result?.customerInterest).toEqual({ viewCount: 3, lastViewedAt: "2026-08-09T12:00:00.000Z" });
    expect(result?.negotiationDifficulty.rounds).toBe(2);
    expect(result?.winProbability).toBeNull();
    expect(result?.financialRisk).toMatchObject({ overdueCount: 2, overdueAmount: "500.00", score: 50 });
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
