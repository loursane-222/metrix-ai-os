import { describe, expect, it, vi } from "vitest";
import { buildCurrentOrderBacklogDataset, buildCurrentOrderBacklogResponse, buildQuoteSentCohortDataset, buildQuoteSentCohortResponse } from "../commercial-performance";

const now = new Date("2026-09-15T09:00:00.000Z");
const reader = (events: unknown[] = [], quotes: unknown[] = [], orders: unknown[] = []) => ({ quoteEvent: { findMany: vi.fn().mockResolvedValue(events) }, quote: { findMany: vi.fn().mockResolvedValue(quotes) }, order: { findMany: vi.fn().mockResolvedValue(orders) } });

describe("canonical commercial performance", () => {
  it("reconciles a sent cohort from full event evidence and current outcomes without claiming historical values", async () => {
    const db = reader([{ quoteId: "q1" }, { quoteId: "q1" }, { quoteId: "q2" }, { quoteId: "q3" }, { quoteId: "q4" }], [
      { id: "q1", status: "WON", amount: 100, currency: "TRY" },
      { id: "q2", status: "LOST", amount: 50, currency: "TRY" },
      { id: "q3", status: "VIEWED", amount: 20, currency: "USD" },
      { id: "q4", status: "CANCELLED", amount: 10, currency: "TRY" },
    ]);
    const dataset = await buildQuoteSentCohortDataset("org-1", { intent: { intent: "QUOTE_COHORT", period: "CURRENT_MONTH" }, now, timeZone: "Europe/Istanbul" }, db);
    expect(db.quoteEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", eventType: "QUOTE_SENT", createdAt: { gte: new Date("2026-08-31T21:00:00.000Z"), lt: now } } }));
    expect(dataset).toMatchObject({ sentCount: 4, approvedCount: 1, rejectedCount: 1, continuingCount: 1, exceptionalCount: 1, valueSemantics: "CURRENT_QUOTE_AMOUNT_NOT_HISTORICAL_SENT_VALUE" });
    expect(dataset.approvedCount + dataset.rejectedCount + dataset.continuingCount + dataset.exceptionalCount).toBe(dataset.sentCount);
    expect(buildQuoteSentCohortResponse(dataset)).toContain("geçmiş gönderim anındaki tutar snapshot'ı bulunmadığından");
  });

  it("keeps current confirmed-order backlog stock currency-separated and tenant-scoped", async () => {
    const db = reader([], [], [
      { id: "o1", status: "APPROVED", currency: "TRY", deadlineAt: null, items: [{ lineTotalCents: BigInt(12500) }] },
      { id: "o2", status: "SHIPPED", currency: "USD", deadlineAt: null, items: [{ lineTotalCents: BigInt(5000) }] },
      { id: "o3", status: "READY", currency: "TRY", deadlineAt: null, items: [] },
    ]);
    const dataset = await buildCurrentOrderBacklogDataset("org-1", { intent: "ORDER_BACKLOG" }, db);
    expect(db.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", sourceQuoteId: { not: null }, status: { notIn: ["COMPLETED", "CANCELLED"] } } }));
    expect(dataset).toMatchObject({ orderCount: 3, currencies: [{ currency: "TRY", orderCount: 2, currentUndeliveredValueCents: "12500", unknownValueCount: 1 }, { currency: "USD", currentUndeliveredValueCents: "5000" }] });
    expect(buildCurrentOrderBacklogResponse(dataset)).toContain("125 TRY");
  });

  it("treats zero as affirmative truth", async () => {
    const cohort = await buildQuoteSentCohortDataset("org", { intent: { intent: "QUOTE_COHORT", period: "CURRENT_MONTH" }, now, timeZone: "Europe/Istanbul" }, reader());
    const backlog = await buildCurrentOrderBacklogDataset("org", { intent: "ORDER_BACKLOG" }, reader());
    expect(buildQuoteSentCohortResponse(cohort)).toContain("bulunmuyor");
    expect(buildCurrentOrderBacklogResponse(backlog)).toContain("bulunmuyor");
  });
});
