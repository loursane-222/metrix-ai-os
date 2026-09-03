import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  listActiveCustomers,
  readQuotesSentInRange,
  readConfirmedOrdersInRange,
  readQuotesForCustomer,
  readConfirmedOrdersForCustomer,
  readCommercialTermsForCustomer,
  buildCurrentReceivableDataset,
  searchConversationHistory,
  buildListableDomainSnapshotFetcher,
  listOrganizationMembers,
  countSalesGoals,
  listSalesGoals,
} = vi.hoisted(() => ({
  listActiveCustomers: vi.fn(),
  readQuotesSentInRange: vi.fn(),
  readConfirmedOrdersInRange: vi.fn(),
  readQuotesForCustomer: vi.fn(),
  readConfirmedOrdersForCustomer: vi.fn(),
  readCommercialTermsForCustomer: vi.fn(),
  buildCurrentReceivableDataset: vi.fn(),
  searchConversationHistory: vi.fn(),
  buildListableDomainSnapshotFetcher: vi.fn(),
  listOrganizationMembers: vi.fn(),
  countSalesGoals: vi.fn(),
  listSalesGoals: vi.fn(),
}));

vi.mock("../company-query-readers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../company-query-readers")>();
  return {
    ...actual,
    listActiveCustomers,
    readQuotesSentInRange,
    readConfirmedOrdersInRange,
    readQuotesForCustomer,
    readConfirmedOrdersForCustomer,
    readCommercialTermsForCustomer,
  };
});
vi.mock("@/lib/core/reporting/current-receivable-intelligence.service", () => ({ buildCurrentReceivableDataset }));
vi.mock("../conversation-history-search.service", () => ({ searchConversationHistory }));
vi.mock("@/lib/executive-request-resolution", () => ({
  buildListableDomainSnapshotFetcher,
  LISTABLE_DOMAIN_LABELS: { stock: "Stok", order: "Sipariş", invoice: "Fatura", payment: "Tahsilat", supplier: "Tedarikçi", product: "Ürün", task: "Görev" },
}));
vi.mock("@/lib/core/organization-members/organization-member.service", () => ({ listOrganizationMembers }));
vi.mock("@/lib/core/goals/goal.service", () => ({ countSalesGoals, listSalesGoals }));

import { executeCompanyQueryPlan } from "../company-query-authority.service";
import type { CompanyQueryPlan } from "../company-query-plan.types";

const now = new Date("2026-09-02T09:00:00.000Z");
const ctx = { now, timeZone: "Europe/Istanbul", conversationId: "conv-current" };
const ORG_A = "org-A";
const ORG_B = "org-B";

const customerA = { id: "cust-1", displayName: "Atlas İnşaat", legalName: null, phone: null, email: null, cariKodu: null, taxNumber: null };
const customerB = { id: "cust-2", displayName: "Vega Yapı", legalName: null, phone: null, email: null, cariKodu: null, taxNumber: null };

function receivableDataset(rows: { customerId: string; customerName: string; totalOutstanding: number; overdueOutstanding: number }[], currency = "TRY") {
  return {
    asOf: now.toISOString(),
    timeZone: "Europe/Istanbul",
    today: "2026-09-02",
    currencies: [{
      currency,
      totalOutstanding: rows.reduce((s, r) => s + r.totalOutstanding, 0),
      overdueOutstanding: 0, dueToday: 0, notYetDue: 0, dueNext7Days: 0, dueNext14Days: 0, dueNext30Days: 0,
      obligationCount: rows.length, overdueObligationCount: 0,
      aging: { NOT_YET_DUE: 0, DUE_TODAY: 0, OVERDUE_1_30: 0, OVERDUE_31_60: 0, OVERDUE_61_90: 0, OVERDUE_90_PLUS: 0 },
      items: [],
      customers: rows,
    }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("company query authority — customer_set composition", () => {
  it("scopes reads by organizationId (tenant isolation) and composes BASE -> EXCEPT -> INTERSECT correctly", async () => {
    readQuotesSentInRange.mockImplementation(async (organizationId: string) => {
      if (organizationId !== ORG_A) throw new Error("wrong org");
      return [
        { id: "q1", customerId: "cust-1", customerName: "Atlas İnşaat", status: "SENT", amount: 1000, currency: "TRY", sentAt: now.toISOString(), wonAt: null, lostAt: null, createdAt: now.toISOString() },
        { id: "q2", customerId: "cust-2", customerName: "Vega Yapı", status: "SENT", amount: 500, currency: "TRY", sentAt: now.toISOString(), wonAt: null, lostAt: null, createdAt: now.toISOString() },
      ];
    });
    readConfirmedOrdersInRange.mockImplementation(async (organizationId: string) => {
      if (organizationId !== ORG_A) throw new Error("wrong org");
      // cust-2 got a confirmed order — should be EXCEPTed out.
      return [{ id: "o1", customerId: "cust-2", status: "APPROVED", confirmedAt: now.toISOString(), confirmedValueCents: "10000", currency: "TRY" }];
    });
    buildCurrentReceivableDataset.mockImplementation(async (organizationId: string) => {
      if (organizationId !== ORG_A) throw new Error("wrong org");
      // Both cust-1 and cust-2 owe money, but only cust-1 survives the EXCEPT step.
      return receivableDataset([
        { customerId: "cust-1", customerName: "Atlas İnşaat", totalOutstanding: 750, overdueOutstanding: 750 },
        { customerId: "cust-2", customerName: "Vega Yapı", totalOutstanding: 300, overdueOutstanding: 0 },
      ]);
    });

    const plan: CompanyQueryPlan = {
      scope: "customer_set",
      setPipeline: [
        { set: "CUSTOMERS_WITH_QUOTE_SENT", op: "BASE" },
        { set: "CUSTOMERS_WITH_CONFIRMED_ORDER", op: "EXCEPT" },
        { set: "CUSTOMERS_WITH_RECEIVABLE_BALANCE", op: "INTERSECT" },
      ],
      dateRange: { kind: "LAST_N_DAYS", days: 90 },
      judgmentNeed: false,
    };

    const result = await executeCompanyQueryPlan(ORG_A, plan, ctx);
    expect(result.scope).toBe("customer_set");
    if (result.scope !== "customer_set") throw new Error("unreachable");
    expect(result.matches.map((m) => m.customerId)).toEqual(["cust-1"]);
    expect(result.matches[0].receivableOutstanding).toEqual([{ currency: "TRY", amount: 750 }]);

    // Every reader must have been called with the requesting org, never another tenant's.
    expect(readQuotesSentInRange).toHaveBeenCalledWith(ORG_A, expect.anything());
    expect(readConfirmedOrdersInRange).toHaveBeenCalledWith(ORG_A, expect.anything());
    expect(buildCurrentReceivableDataset).toHaveBeenCalledWith(ORG_A, expect.anything());
  });

  it("never leaks another organization's rows into the result even if a reader is called for org B in the same test run", async () => {
    readQuotesSentInRange.mockImplementation(async (organizationId: string) =>
      organizationId === ORG_A
        ? [{ id: "q1", customerId: "cust-1", customerName: "Atlas İnşaat", status: "SENT", amount: 100, currency: "TRY", sentAt: now.toISOString(), wonAt: null, lostAt: null, createdAt: now.toISOString() }]
        : [{ id: "qX", customerId: "cust-999", customerName: "Yabancı Org Müşterisi", status: "SENT", amount: 1, currency: "TRY", sentAt: now.toISOString(), wonAt: null, lostAt: null, createdAt: now.toISOString() }]);
    readConfirmedOrdersInRange.mockResolvedValue([]);
    buildCurrentReceivableDataset.mockResolvedValue(receivableDataset([]));

    const plan: CompanyQueryPlan = {
      scope: "customer_set",
      setPipeline: [{ set: "CUSTOMERS_WITH_QUOTE_SENT", op: "BASE" }],
      dateRange: null,
      judgmentNeed: false,
    };
    const resultA = await executeCompanyQueryPlan(ORG_A, plan, ctx);
    if (resultA.scope !== "customer_set") throw new Error("unreachable");
    expect(resultA.matches.map((m) => m.customerId)).toEqual(["cust-1"]);
    expect(resultA.matches.some((m) => m.customerId === "cust-999")).toBe(false);
  });

  it("returns no matches (not an error) when the composed set is empty", async () => {
    readQuotesSentInRange.mockResolvedValue([]);
    readConfirmedOrdersInRange.mockResolvedValue([]);
    buildCurrentReceivableDataset.mockResolvedValue(receivableDataset([]));
    const plan: CompanyQueryPlan = {
      scope: "customer_set",
      setPipeline: [{ set: "CUSTOMERS_WITH_QUOTE_SENT", op: "BASE" }, { set: "CUSTOMERS_WITH_RECEIVABLE_BALANCE", op: "INTERSECT" }],
      dateRange: null,
      judgmentNeed: false,
    };
    const result = await executeCompanyQueryPlan(ORG_A, plan, ctx);
    if (result.scope !== "customer_set") throw new Error("unreachable");
    expect(result.matches).toEqual([]);
  });

  it("keeps the receivable set membership check scoped to CURRENT balance, independent of the pipeline's own date range", async () => {
    // The receivable reader is not date-windowed at all — verify it's called
    // without the resolved quote/order window being threaded into it.
    readQuotesSentInRange.mockResolvedValue([{ id: "q1", customerId: "cust-1", customerName: "Atlas İnşaat", status: "SENT", amount: 1, currency: "TRY", sentAt: now.toISOString(), wonAt: null, lostAt: null, createdAt: now.toISOString() }]);
    buildCurrentReceivableDataset.mockResolvedValue(receivableDataset([{ customerId: "cust-1", customerName: "Atlas İnşaat", totalOutstanding: 100, overdueOutstanding: 0 }]));
    const plan: CompanyQueryPlan = {
      scope: "customer_set",
      setPipeline: [{ set: "CUSTOMERS_WITH_QUOTE_SENT", op: "BASE" }, { set: "CUSTOMERS_WITH_RECEIVABLE_BALANCE", op: "INTERSECT" }],
      dateRange: { kind: "LAST_N_DAYS", days: 7 },
      judgmentNeed: false,
    };
    await executeCompanyQueryPlan(ORG_A, plan, ctx);
    expect(buildCurrentReceivableDataset).toHaveBeenCalledWith(ORG_A, {});
  });
});

describe("company query authority — single_customer", () => {
  it("resolves a named customer and gathers only the requested facts (no extra reads)", async () => {
    listActiveCustomers.mockResolvedValue([customerA, customerB]);
    readQuotesForCustomer.mockResolvedValue([]);
    const plan: CompanyQueryPlan = {
      scope: "single_customer",
      customerReference: "Atlas",
      facts: ["QUOTE_HISTORY"],
      dateRange: null,
      conversationTopicKeywords: null,
      judgmentNeed: false,
    };
    const result = await executeCompanyQueryPlan(ORG_A, plan, ctx);
    expect(result.scope).toBe("single_customer");
    if (result.scope !== "single_customer") throw new Error("unreachable");
    expect(result.customer.id).toBe("cust-1");
    expect(readQuotesForCustomer).toHaveBeenCalledWith(ORG_A, "cust-1", null);
    expect(readConfirmedOrdersForCustomer).not.toHaveBeenCalled();
    expect(readCommercialTermsForCustomer).not.toHaveBeenCalled();
    expect(buildCurrentReceivableDataset).not.toHaveBeenCalled();
    expect(searchConversationHistory).not.toHaveBeenCalled();
  });

  it("reports customer_not_found instead of guessing a similar name", async () => {
    listActiveCustomers.mockResolvedValue([customerA, customerB]);
    const plan: CompanyQueryPlan = { scope: "single_customer", customerReference: "Nonexistent Corp", facts: ["QUOTE_HISTORY"], dateRange: null, conversationTopicKeywords: null, judgmentNeed: false };
    const result = await executeCompanyQueryPlan(ORG_A, plan, ctx);
    expect(result).toMatchObject({ scope: "customer_not_found", reference: "Nonexistent Corp" });
  });

  it("reports customer_ambiguous with candidates rather than picking one arbitrarily", async () => {
    const dup1 = { ...customerA, id: "cust-1a" };
    const dup2 = { ...customerA, id: "cust-1b" };
    listActiveCustomers.mockResolvedValue([dup1, dup2]);
    const plan: CompanyQueryPlan = { scope: "single_customer", customerReference: "Atlas İnşaat", facts: ["QUOTE_HISTORY"], dateRange: null, conversationTopicKeywords: null, judgmentNeed: false };
    const result = await executeCompanyQueryPlan(ORG_A, plan, ctx);
    expect(result.scope).toBe("customer_ambiguous");
    if (result.scope !== "customer_ambiguous") throw new Error("unreachable");
    expect(result.candidates.map((c) => c.id).sort()).toEqual(["cust-1a", "cust-1b"]);
  });

  it("passes the resolved customer name plus topic keywords into conversation history search, excluding the current conversation", async () => {
    listActiveCustomers.mockResolvedValue([customerA]);
    searchConversationHistory.mockResolvedValue([]);
    const plan: CompanyQueryPlan = {
      scope: "single_customer", customerReference: "Atlas", facts: ["CONVERSATION_HISTORY"],
      dateRange: null, conversationTopicKeywords: ["ödeme planı"], judgmentNeed: false,
    };
    await executeCompanyQueryPlan(ORG_A, plan, ctx);
    expect(searchConversationHistory).toHaveBeenCalledWith(ORG_A, {
      excludeConversationId: "conv-current",
      keywords: ["Atlas İnşaat", "ödeme planı"],
    });
  });

  it("distinguishes 'commercial terms not requested' from 'requested but none on file'", async () => {
    listActiveCustomers.mockResolvedValue([customerA]);
    readCommercialTermsForCustomer.mockResolvedValue(null);
    const plan: CompanyQueryPlan = { scope: "single_customer", customerReference: "Atlas", facts: ["COMMERCIAL_TERMS"], dateRange: null, conversationTopicKeywords: null, judgmentNeed: false };
    const result = await executeCompanyQueryPlan(ORG_A, plan, ctx);
    if (result.scope !== "single_customer") throw new Error("unreachable");
    expect(result.commercialTerms).toBeNull();

    const planWithoutTerms: CompanyQueryPlan = { scope: "single_customer", customerReference: "Atlas", facts: ["QUOTE_HISTORY"], dateRange: null, conversationTopicKeywords: null, judgmentNeed: false };
    readQuotesForCustomer.mockResolvedValue([]);
    const resultWithout = await executeCompanyQueryPlan(ORG_A, planWithoutTerms, ctx);
    if (resultWithout.scope !== "single_customer") throw new Error("unreachable");
    expect(resultWithout.commercialTerms).toBeUndefined();
  });

  it("extracts only this customer's receivable row from the shared currency dataset (correct currency/customer join)", async () => {
    listActiveCustomers.mockResolvedValue([customerA, customerB]);
    buildCurrentReceivableDataset.mockResolvedValue({
      asOf: now.toISOString(), timeZone: "Europe/Istanbul", today: "2026-09-02",
      currencies: [
        { currency: "TRY", totalOutstanding: 1300, overdueOutstanding: 0, dueToday: 0, notYetDue: 0, dueNext7Days: 0, dueNext14Days: 0, dueNext30Days: 0, obligationCount: 2, overdueObligationCount: 0, aging: { NOT_YET_DUE: 0, DUE_TODAY: 0, OVERDUE_1_30: 0, OVERDUE_31_60: 0, OVERDUE_61_90: 0, OVERDUE_90_PLUS: 0 }, items: [],
          customers: [
            { customerId: "cust-1", customerName: "Atlas İnşaat", totalOutstanding: 1000, overdueOutstanding: 400, dueToday: 0, notYetDue: 600, oldestOverdueDays: 10, overdueObligationCount: 1 },
            { customerId: "cust-2", customerName: "Vega Yapı", totalOutstanding: 300, overdueOutstanding: 0, dueToday: 0, notYetDue: 300, oldestOverdueDays: 0, overdueObligationCount: 0 },
          ] },
        { currency: "USD", totalOutstanding: 50, overdueOutstanding: 0, dueToday: 0, notYetDue: 50, dueNext7Days: 0, dueNext14Days: 0, dueNext30Days: 0, obligationCount: 1, overdueObligationCount: 0, aging: { NOT_YET_DUE: 0, DUE_TODAY: 0, OVERDUE_1_30: 0, OVERDUE_31_60: 0, OVERDUE_61_90: 0, OVERDUE_90_PLUS: 0 }, items: [],
          customers: [{ customerId: "cust-1", customerName: "Atlas İnşaat", totalOutstanding: 50, overdueOutstanding: 0, dueToday: 0, notYetDue: 50, oldestOverdueDays: 0, overdueObligationCount: 0 }] },
      ],
    });
    const plan: CompanyQueryPlan = { scope: "single_customer", customerReference: "Atlas", facts: ["RECEIVABLE_POSITION"], dateRange: null, conversationTopicKeywords: null, judgmentNeed: false };
    const result = await executeCompanyQueryPlan(ORG_A, plan, ctx);
    if (result.scope !== "single_customer") throw new Error("unreachable");
    expect(result.receivable).toEqual([
      { currency: "TRY", totalOutstanding: 1000, overdueOutstanding: 400 },
      { currency: "USD", totalOutstanding: 50, overdueOutstanding: 0 },
    ]);
  });
});

describe("company query authority — domain_count (shared canonical result set)", () => {
  it("returns the REAL, unfiltered customer total for domain 'customers' (the reported '2 vs 300+' bug's exact fix)", async () => {
    const manyCustomers = Array.from({ length: 312 }, (_, i) => ({ ...customerA, id: `cust-${i}`, displayName: `Müşteri ${i}` }));
    listActiveCustomers.mockResolvedValue(manyCustomers);
    const plan: CompanyQueryPlan = { scope: "domain_count", domain: "customers", judgmentNeed: false };
    const result = await executeCompanyQueryPlan(ORG_A, plan, ctx);
    expect(result).toMatchObject({ scope: "domain_count", domain: "customers", recordCount: 312 });
    if (result.scope !== "domain_count") throw new Error("unreachable");
    expect(result.sampleNames).toHaveLength(5);
    expect(listActiveCustomers).toHaveBeenCalledWith(ORG_A);
  });

  it("reuses the SAME shared listable-domain snapshot fetcher businessNavigation's list-open path uses, for a non-customer domain", async () => {
    const fetchForOrg = vi.fn().mockResolvedValue({ recordCount: 47, recordNames: ["SIP-0001", "SIP-0002", "SIP-0003"] });
    buildListableDomainSnapshotFetcher.mockReturnValue(fetchForOrg);
    const plan: CompanyQueryPlan = { scope: "domain_count", domain: "order", judgmentNeed: false };
    const result = await executeCompanyQueryPlan(ORG_A, plan, ctx);
    expect(buildListableDomainSnapshotFetcher).toHaveBeenCalledWith(ORG_A);
    expect(fetchForOrg).toHaveBeenCalledWith("order");
    expect(result).toMatchObject({ scope: "domain_count", domain: "order", label: "Sipariş", recordCount: 47 });
  });

  it("works identically for a third, distinct domain (task) — proving the mechanism is domain-general, not customer-specific", async () => {
    const fetchForOrg = vi.fn().mockResolvedValue({ recordCount: 8, recordNames: ["Teklifleri gözden geçir"] });
    buildListableDomainSnapshotFetcher.mockReturnValue(fetchForOrg);
    const plan: CompanyQueryPlan = { scope: "domain_count", domain: "task", judgmentNeed: false };
    const result = await executeCompanyQueryPlan(ORG_A, plan, ctx);
    expect(fetchForOrg).toHaveBeenCalledWith("task");
    expect(result).toMatchObject({ scope: "domain_count", domain: "task", label: "Görev", recordCount: 8 });
  });

  it("caps the sample to 5 names even when recordNames carries more", async () => {
    listActiveCustomers.mockResolvedValue(Array.from({ length: 20 }, (_, i) => ({ ...customerA, id: `c${i}`, displayName: `C${i}` })));
    const plan: CompanyQueryPlan = { scope: "domain_count", domain: "customers", judgmentNeed: false };
    const result = await executeCompanyQueryPlan(ORG_A, plan, ctx);
    if (result.scope !== "domain_count") throw new Error("unreachable");
    expect(result.sampleNames.length).toBeLessThanOrEqual(5);
  });

  it("resolves 'team' through the real, uncapped organization-member listing (not the generic ListableDomain fetcher)", async () => {
    listOrganizationMembers.mockResolvedValue([
      { id: "m1", email: "a@b.com", fullName: "Ali Veli", role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
      { id: "m2", email: "c@d.com", fullName: null, role: "EMPLOYEE", status: "ACTIVE", joinedAt: new Date() },
    ]);
    const plan: CompanyQueryPlan = { scope: "domain_count", domain: "team", judgmentNeed: false };
    const result = await executeCompanyQueryPlan(ORG_A, plan, ctx);
    expect(listOrganizationMembers).toHaveBeenCalledWith(ORG_A);
    expect(result).toMatchObject({ scope: "domain_count", domain: "team", label: "Ekip Üyesi", recordCount: 2 });
    if (result.scope !== "domain_count") throw new Error("unreachable");
    expect(result.sampleNames).toEqual(["Ali Veli", "c@d.com"]);
  });

  it("resolves 'goal' through the real, uncapped count function — not listSalesGoals().length, which is capped at 50", async () => {
    countSalesGoals.mockResolvedValue(63);
    listSalesGoals.mockResolvedValue([{ id: "g1", title: "Q1 Satış" }, { id: "g2", title: "Q1 Tahsilat" }]);
    const plan: CompanyQueryPlan = { scope: "domain_count", domain: "goal", judgmentNeed: false };
    const result = await executeCompanyQueryPlan(ORG_A, plan, ctx);
    expect(countSalesGoals).toHaveBeenCalledWith({ organizationId: ORG_A });
    expect(result).toMatchObject({ scope: "domain_count", domain: "goal", label: "Hedef", recordCount: 63 });
    if (result.scope !== "domain_count") throw new Error("unreachable");
    expect(result.sampleNames).toEqual(["Q1 Satış", "Q1 Tahsilat"]);
  });
});
