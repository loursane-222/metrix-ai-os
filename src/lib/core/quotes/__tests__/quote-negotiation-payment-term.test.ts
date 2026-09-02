import { beforeEach, describe, expect, it, vi } from "vitest";

const { transaction, quoteFind, proposalFind, quoteUpdate, quoteEventCreate, orderFind } = vi.hoisted(() => ({ transaction: vi.fn(), quoteFind: vi.fn(), proposalFind: vi.fn(), quoteUpdate: vi.fn(), quoteEventCreate: vi.fn(), orderFind: vi.fn() }));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { $transaction: transaction } }));

import { acceptQuoteWithLatestNegotiatedTerms } from "../quote.service";

describe("accepted quote payment-term resolution", () => {
  beforeEach(() => {
    quoteFind.mockReset().mockResolvedValueOnce({ status: "NEGOTIATION", paymentTerm: "60 gün", paymentTermStructured: { schemaVersion: 1, strategy: "SCHEDULE", components: [{ allocationType: "PERCENTAGE", percentageBasisPoints: 10_000, maturityBasis: "DAYS_AFTER_REFERENCE", days: 60, referenceDateType: "INVOICE_DATE" }] } }).mockResolvedValue({ status: "WON", items: [] });
    proposalFind.mockReset().mockResolvedValue({ proposedPaymentTerm: "%50 peşin, kalanı 30 gün", proposedPaymentTermStructured: { schemaVersion: 1, strategy: "SCHEDULE", components: [{ allocationType: "PERCENTAGE", percentageBasisPoints: 5000, maturityBasis: "IMMEDIATE" }, { allocationType: "PERCENTAGE", percentageBasisPoints: 5000, maturityBasis: "DAYS_AFTER_REFERENCE", days: 30, referenceDateType: "INVOICE_DATE" }] } });
    quoteUpdate.mockReset().mockResolvedValue({ count: 1 });
    quoteEventCreate.mockReset().mockResolvedValue({}); orderFind.mockReset().mockResolvedValue({ id: "order-1" });
    transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback({ quote: { findFirst: quoteFind, updateMany: quoteUpdate }, quoteCounterProposal: { findFirst: proposalFind }, quoteEvent: { create: quoteEventCreate }, order: { findFirst: orderFind } }));
  });

  it("promotes the latest negotiated structured term into the WON Quote", async () => {
    await expect(acceptQuoteWithLatestNegotiatedTerms({ quoteId: "q1", organizationId: "o1", wonAt: new Date("2026-01-01") })).resolves.toBe(true);
    expect(proposalFind).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: "desc" } }));
    expect(quoteUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "WON", paymentTerm: "%50 peşin, kalanı 30 gün", paymentTermStructured: expect.objectContaining({ schemaVersion: 1 }) }) }));
    expect(quoteUpdate.mock.calls[0]?.[0].data.paymentTermStructured.components).toHaveLength(2);
    expect(quoteEventCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: "QUOTE_WON" }) }));
    expect(orderFind).toHaveBeenCalled();
  });
});
