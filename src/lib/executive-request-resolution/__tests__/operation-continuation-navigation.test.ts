import { describe, expect, it } from "vitest";
import { resolveOperationContinuationNavigation } from "../business-navigation";

describe("resolveOperationContinuationNavigation", () => {
  it("is not applicable with no prior operation context", () => {
    expect(resolveOperationContinuationNavigation(true, null)).toEqual({ status: "NOT_APPLICABLE" });
  });

  it("is not applicable when the utterance isn't a bare reveal follow-up", () => {
    expect(resolveOperationContinuationNavigation(false, { domain: "customers", entityId: "cust-1" })).toEqual({ status: "NOT_APPLICABLE" });
  });

  it("resolves the exact customer detail surface for a customers-domain context", () => {
    expect(resolveOperationContinuationNavigation(true, { domain: "customers", entityId: "cust-1" })).toEqual({
      status: "RESOLVED",
      descriptor: { domain: "customer", kind: "customer.detail", customerId: "cust-1" },
    });
  });

  it("resolves the exact offer edit surface for a quotes-domain context", () => {
    expect(resolveOperationContinuationNavigation(true, { domain: "quotes", entityId: "quote-1" })).toEqual({
      status: "RESOLVED",
      descriptor: { domain: "offer", kind: "offer.edit", quoteId: "quote-1" },
    });
  });

  // Per the brief's explicit rule: no detail surface exists for most
  // domains (e.g. Supplier) — this must decline deterministically, never
  // invent a surface that doesn't exist.
  it("reports UNAVAILABLE, never a fabricated surface, for a domain with no detail descriptor", () => {
    expect(resolveOperationContinuationNavigation(true, { domain: "suppliers", entityId: "supplier-1" })).toEqual({
      status: "UNAVAILABLE",
      domain: "suppliers",
    });
  });
});
