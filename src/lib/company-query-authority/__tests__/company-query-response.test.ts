import { describe, expect, it } from "vitest";
import { buildCompanyQueryResponse } from "../company-query-response";
import type { CompanyQueryResult } from "../company-query-authority.service";

const customer = { id: "cust-1", displayName: "Atlas İnşaat", legalName: null, phone: null, email: null, cariKodu: null, taxNumber: null };

describe("buildCompanyQueryResponse — deterministic text, no interpretation", () => {
  it("says so honestly when no customer matches the reference, instead of guessing", () => {
    const text = buildCompanyQueryResponse({ scope: "customer_not_found", reference: "Bilinmeyen A.Ş." });
    expect(text).toContain("Bilinmeyen A.Ş.");
    expect(text.toLowerCase()).toContain("bulamadım");
  });

  it("lists every ambiguous candidate rather than silently picking one", () => {
    const text = buildCompanyQueryResponse({
      scope: "customer_ambiguous",
      reference: "Atlas",
      candidates: [customer, { ...customer, id: "cust-2", displayName: "Atlas Yapı" }],
    });
    expect(text).toContain("Atlas İnşaat");
    expect(text).toContain("Atlas Yapı");
  });

  it("reports zero matches honestly for an empty customer_set result", () => {
    const text = buildCompanyQueryResponse({ scope: "customer_set", dateRangeLabel: "90 günlük dönem", setPipelineDescription: ["BASE(x)"], matches: [] });
    expect(text.toLowerCase()).toContain("bulamadım");
  });

  it("lists every matching customer with its receivable figure, using only numbers already on the match object", () => {
    const text = buildCompanyQueryResponse({
      scope: "customer_set",
      dateRangeLabel: "90 günlük dönem",
      setPipelineDescription: ["BASE(a)", "EXCEPT(b)"],
      matches: [
        { customerId: "cust-1", customerName: "Atlas İnşaat", receivableOutstanding: [{ currency: "TRY", amount: 750 }] },
        { customerId: "cust-2", customerName: "Vega Yapı", receivableOutstanding: null },
      ],
    });
    expect(text).toContain("2 müşteri");
    expect(text).toContain("Atlas İnşaat");
    expect(text).toContain("750");
    expect(text).toContain("Vega Yapı");
  });

  it("distinguishes 'commercial terms not requested' (omitted) from 'requested but none on file' (explicit line)", () => {
    const base: Extract<CompanyQueryResult, { scope: "single_customer" }> = {
      scope: "single_customer", customer, dateRangeLabel: null,
      quoteHistory: null, orderHistory: null, receivable: null, commercialTerms: undefined, conversationHistory: null,
    };
    expect(buildCompanyQueryResponse(base)).not.toContain("Ticari koşullar");
    expect(buildCompanyQueryResponse({ ...base, commercialTerms: null })).toContain("kayıtlı özel bir ticari koşul bulunmuyor");
    expect(buildCompanyQueryResponse({ ...base, commercialTerms: { paymentTermDays: 30, creditLimitCents: "500000", defaultCurrency: "TRY", deliveryTerm: "EXW" } })).toContain("30 gün");
  });

  it("summarizes conversation history hits with date and snippet, or says none were found", () => {
    const base: Extract<CompanyQueryResult, { scope: "single_customer" }> = {
      scope: "single_customer", customer, dateRangeLabel: null,
      quoteHistory: null, orderHistory: null, receivable: null, commercialTerms: undefined, conversationHistory: [],
    };
    expect(buildCompanyQueryResponse(base)).toContain("bulamadım");
    const withHit = buildCompanyQueryResponse({
      ...base,
      conversationHistory: [{ conversationId: "c1", conversationTitle: "Atlas görüşmesi", createdAt: "2026-01-15T10:00:00.000Z", snippet: "ödeme planını konuştuk" }],
    });
    expect(withHit).toContain("ödeme planını konuştuk");
    expect(withHit).toContain("Atlas görüşmesi");
  });

  it("never invents a number that isn't already on the result object (pure formatting, not computation)", () => {
    const text = buildCompanyQueryResponse({
      scope: "single_customer", customer, dateRangeLabel: "Ağustos 2026",
      quoteHistory: [
        { id: "q1", customerId: "cust-1", customerName: "Atlas İnşaat", status: "WON", amount: 100, currency: "TRY", sentAt: "2026-08-01T00:00:00.000Z", wonAt: "2026-08-05T00:00:00.000Z", lostAt: null, createdAt: "2026-08-01T00:00:00.000Z" },
        { id: "q2", customerId: "cust-1", customerName: "Atlas İnşaat", status: "SENT", amount: 200, currency: "TRY", sentAt: "2026-08-10T00:00:00.000Z", wonAt: null, lostAt: null, createdAt: "2026-08-10T00:00:00.000Z" },
      ],
      orderHistory: null, receivable: null, commercialTerms: undefined, conversationHistory: null,
    });
    // 2 total, 2 sent, 1 won, 0 lost, 1 open — every count derivable straight
    // from the two input rows above, nothing extra.
    expect(text).toContain("2 teklif");
    expect(text).toContain("1 kazanılmış");
    expect(text).toContain("0 kaybedilmiş");
    expect(text).toContain("1 açık");
  });
});
