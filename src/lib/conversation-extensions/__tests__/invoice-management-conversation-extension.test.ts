import { describe, expect, it } from "vitest";
import type { QuoteRecord } from "@/lib/offers/quotes-client";
import { resolveInvoiceSourceQuote } from "../invoice-management-conversation-extension";

function quote(overrides: Partial<QuoteRecord>): QuoteRecord {
  return {
    id: "quote-1", organizationId: "org-1", customerId: "customer-1", customerName: "Atlas", title: "Atlas Teklifi",
    amount: "4500", currency: "TRY", status: "SENT", sentAt: null, viewedAt: null, wonAt: null, lostAt: null,
    notes: null, customerNote: null, validUntil: null, generalDiscountBasisPoints: null, paymentTerm: null,
    deliveryTerm: null, deliveryMethod: null, metadata: null, createdAt: "2026-01-01", updatedAt: "2026-01-01", items: [],
    ...overrides,
  };
}

describe("resolveInvoiceSourceQuote", () => {
  it("returns the single priced quote belonging to the resolved customer", () => {
    const result = resolveInvoiceSourceQuote([
      quote({ id: "unpriced", amount: null }),
      quote({ id: "other", customerId: "customer-2" }),
      quote({ id: "source" }),
    ], "customer-1");

    expect(result).toMatchObject({ id: "source", amount: "4500" });
  });

  it("refuses to guess when more than one source quote is eligible", () => {
    expect(resolveInvoiceSourceQuote([quote({ id: "one" }), quote({ id: "two" })], "customer-1")).toBe("AMBIGUOUS");
  });
});
