import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import type { ActiveWorkspaceContext } from "@/lib/living-workspace";
import { projectBusinessNavigation, projectBusinessNavigationOperationEvidence, resolveBusinessNavigation } from "../business-navigation";

const understanding = (businessNavigation: NonNullable<ConversationUnderstanding["businessNavigation"]>, sourceConfidence: "high" | "medium" | "low" = "high"): ConversationUnderstanding => ({
  conversationKind: "company_related", userMotivation: "bilgi_almak", companyRelevance: "high", actionExpectation: "explicit", confidence: sourceConfidence,
  shouldAskClarification: false, shouldInvokeExecutiveBrain: true, suggestedHandling: "executive_reasoning", businessNavigation,
  reasoning: { summary: "Canonical fixture", observations: [], uncertainty: [], whyThisHandling: "Already resolved upstream." },
});
const customers = [{ id: "atlas-1", displayName: "Atlas", legalName: null, phone: null, email: null, cariKodu: null, taxNumber: null }];
const activeCustomer = (overrides: Partial<ActiveWorkspaceContext> = {}): ActiveWorkspaceContext => ({
  domain: "customer", businessSurface: "customer-detail", entityType: "Customer", entityId: "open-customer-1", title: "Açık Müşteri", ...overrides,
});

describe("typed business navigation resolution", () => {
  it.each([
    [{ operation: "NAVIGATE", domain: "company", target: "root", entityReference: null } as const, "/metrix/company"],
    [{ operation: "NAVIGATE", domain: "customer", target: "list", entityReference: null } as const, "/metrix/customers"],
    [{ operation: "NAVIGATE", domain: "customer", target: "create", entityReference: null } as const, "/metrix/customers/new"],
    [{ operation: "NAVIGATE", domain: "offer", target: "list", entityReference: null } as const, "/metrix/offers"],
    [{ operation: "NAVIGATE", domain: "product", target: "list", entityReference: null } as const, "/metrix/products"],
    [{ operation: "NAVIGATE", domain: "task", target: "create", entityReference: null } as const, "/metrix/tasks/new"],
    [{ operation: "NAVIGATE", domain: "calendar", target: "root", entityReference: null } as const, "/metrix/calendar"],
    [{ operation: "NAVIGATE", domain: "accounting", target: "root", entityReference: null } as const, "/metrix/accounting"],
    [{ operation: "NAVIGATE", domain: "report", target: "root", entityReference: null } as const, "/metrix/reports"],
    [{ operation: "NAVIGATE", domain: "document", target: "root", entityReference: null } as const, "/metrix/documents"],
    [{ operation: "NAVIGATE", domain: "kpi", target: "root", entityReference: null } as const, "/metrix/kpis"],
  ])("projects structured understanding to a domain-owned route", async (request, route) => {
    const result = await resolveBusinessNavigation({ understanding: understanding(request), listCustomers: async () => customers });
    expect(result.status).toBe("RESOLVED");
    if (result.status === "RESOLVED") expect(projectBusinessNavigation(result.descriptor).route).toBe(route);
  });
  it.each(["detail", "edit"] as const)("resolves a customer %s target to a verified id", async (target) => {
    const result = await resolveBusinessNavigation({ understanding: understanding({ operation: "NAVIGATE", domain: "customer", target, entityReference: "Atlas" }), listCustomers: async () => customers });
    expect(result.status).toBe("RESOLVED");
    if (result.status === "RESOLVED") expect(projectBusinessNavigation(result.descriptor).route).toBe(target === "edit" ? "/metrix/customers/atlas-1/edit" : "/metrix/customers/atlas-1");
  });
  it("uses the matching open workspace entity when the user does not say a name", async () => {
    const lookup = vi.fn(async () => customers);
    const result = await resolveBusinessNavigation({
      understanding: understanding({ operation: "NAVIGATE", domain: "customer", target: "edit", entityReference: null }),
      activeWorkspaceContext: activeCustomer(),
      listCustomers: lookup,
    });
    expect(result).toMatchObject({ status: "RESOLVED", descriptor: { domain: "customer", kind: "customer.edit", customerId: "open-customer-1" } });
    expect(lookup).not.toHaveBeenCalled();
  });
  it("does not use an open workspace from a different domain", async () => {
    const result = await resolveBusinessNavigation({
      understanding: understanding({ operation: "NAVIGATE", domain: "customer", target: "edit", entityReference: null }),
      activeWorkspaceContext: activeCustomer({ domain: "offer", businessSurface: "offer-edit", entityType: "Quote", entityId: "quote-1" }),
      listCustomers: async () => customers,
    });
    expect(result).toEqual({ status: "CLARIFICATION_REQUIRED", reason: "MISSING_ENTITY" });
  });
  it("keeps an explicitly spoken name ahead of the open workspace entity", async () => {
    const result = await resolveBusinessNavigation({
      understanding: understanding({ operation: "NAVIGATE", domain: "customer", target: "edit", entityReference: "Atlas" }),
      activeWorkspaceContext: activeCustomer(),
      listCustomers: async () => customers,
    });
    expect(result).toMatchObject({ status: "RESOLVED", descriptor: { domain: "customer", kind: "customer.edit", customerId: "atlas-1" } });
  });
  it("preserves missing-entity clarification when there is no open workspace", async () => {
    const result = await resolveBusinessNavigation({
      understanding: understanding({ operation: "NAVIGATE", domain: "customer", target: "edit", entityReference: null }),
      activeWorkspaceContext: null,
      listCustomers: async () => customers,
    });
    expect(result).toEqual({ status: "CLARIFICATION_REQUIRED", reason: "MISSING_ENTITY" });
  });
  it("uses an open offer id directly for offer edit without customer-name matching", async () => {
    const lookup = vi.fn(async () => customers);
    const result = await resolveBusinessNavigation({
      understanding: understanding({ operation: "NAVIGATE", domain: "offer", target: "edit", entityReference: null }),
      activeWorkspaceContext: activeCustomer({ domain: "offer", businessSurface: "offer-edit", entityType: "Quote", entityId: "quote-open-1" }),
      listCustomers: lookup,
    });
    expect(result).toMatchObject({ status: "RESOLVED", descriptor: { domain: "offer", kind: "offer.edit", quoteId: "quote-open-1" } });
    expect(lookup).not.toHaveBeenCalled();
  });
  it("does not navigate for ambiguous or missing entities", async () => {
    const request = understanding({ operation: "NAVIGATE", domain: "customer", target: "detail", entityReference: "Atlas" });
    const ambiguous = await resolveBusinessNavigation({ understanding: request, listCustomers: async () => [...customers, { ...customers[0]!, id: "atlas-2" }] });
    const missing = await resolveBusinessNavigation({ understanding: request, listCustomers: async () => [] });
    expect(ambiguous).toEqual({ status: "CLARIFICATION_REQUIRED", reason: "AMBIGUOUS_ENTITY" });
    expect(missing).toEqual({ status: "NOT_FOUND" });
    expect(projectBusinessNavigationOperationEvidence(missing)).toEqual({ operation: "CUSTOMER_LOOKUP", canonicalRepositoryQueried: true, outcome: "NOT_FOUND", createProposalAllowed: true, navigationProjected: false });
    expect(projectBusinessNavigationOperationEvidence(ambiguous)).toEqual({ operation: "CUSTOMER_LOOKUP", canonicalRepositoryQueried: true, outcome: "AMBIGUOUS", createProposalAllowed: false, navigationProjected: false });
  });
  it("keeps written and voice on the same semantic resolver with no model call", async () => {
    const lookup = vi.fn(async () => customers);
    const result = await resolveBusinessNavigation({ understanding: understanding({ operation: "NAVIGATE", domain: "customer", target: "detail", entityReference: "Atlas" }), listCustomers: lookup });
    expect(result.status).toBe("RESOLVED"); expect(lookup).toHaveBeenCalledOnce();
    expect(readFileSync(new URL("../business-navigation.ts", import.meta.url), "utf8")).not.toMatch(/OpenAI|responses\.create|classifyConversation/);
  });
  it("connects the chat lifecycle to one navigation event and leaves the host single-owned", () => {
    const route = readFileSync(new URL("../../../app/api/ai/chat/route.ts", import.meta.url), "utf8");
    const chat = readFileSync(new URL("../../../components/metrix-tab/MetrixChatTab.tsx", import.meta.url), "utf8");
    const layout = readFileSync(new URL("../../../app/metrix/layout.tsx", import.meta.url), "utf8");
    expect(route.match(/type: "navigation"/g)).toHaveLength(1);
    expect(chat).toContain("dispatchConversationNavigation");
    expect(layout.match(/<ExecutiveNavigationCommandHost/g)).toHaveLength(1);
  });
  it("removes customer phrase navigation ownership", () => {
    const extension = readFileSync(new URL("../../conversation-extensions/customer-management-conversation-extension.ts", import.meta.url), "utf8");
    expect(extension).not.toMatch(/musteri\(ler\)|müşterisini\\s\+\(aç|bu musteriyi/);
  });

  // Living Workspace Determinism Operation — Gap 1: a create-with-Surface
  // domain resolving here must produce explicit MUTATION_SURFACE_RESOLVED
  // evidence, regardless of whether any client-side conversation extension
  // ever engages. resolveBusinessNavigation's own input shape (understanding
  // + listCustomers + findLatestQuoteIdForCustomer, no conversationExtension
  // handoff parameter at all) already proves this resolution can never depend
  // on client-extension state — it is computed unconditionally server-side.
  it.each([
    [{ operation: "NAVIGATE", domain: "customer", target: "create", entityReference: null } as const, "customer"],
    [{ operation: "NAVIGATE", domain: "task", target: "create", entityReference: null } as const, "task"],
  ])("resolves %o to MUTATION_SURFACE_RESOLVED evidence with no client-extension input required", async (request, domain) => {
    const result = await resolveBusinessNavigation({ understanding: understanding(request), listCustomers: async () => customers });
    expect(result.status).toBe("RESOLVED");
    expect(projectBusinessNavigationOperationEvidence(result)).toEqual({ operation: "MUTATION_SURFACE_RESOLVED", domain });
  });
  it("resolves offer create to MUTATION_SURFACE_RESOLVED evidence for a real customer", async () => {
    const result = await resolveBusinessNavigation({ understanding: understanding({ operation: "NAVIGATE", domain: "offer", target: "create", entityReference: "Atlas" }), listCustomers: async () => customers });
    expect(result.status).toBe("RESOLVED");
    expect(projectBusinessNavigationOperationEvidence(result)).toEqual({ operation: "MUTATION_SURFACE_RESOLVED", domain: "offer" });
  });
  it("projects deterministic Calendar-open evidence for canonical narration", async () => {
    const result = await resolveBusinessNavigation({ understanding: understanding({ operation: "NAVIGATE", domain: "calendar", target: "root", entityReference: null }), listCustomers: async () => customers });
    expect(projectBusinessNavigationOperationEvidence(result)).toEqual({ operation: "CALENDAR_OPEN", navigationProjected: true });
  });

  describe("Calendar view/date authority — deterministic resolution from the server clock, never from the model", () => {
    // Fixed "now" so today/tomorrow/explicit-date resolution is deterministic
    // in the test, independent of when it actually runs.
    const now = new Date(2026, 7, 25); // 2026-08-25 (Tuesday)
    it.each([
      ["Bugünkü programımı göster", { calendarView: "day", calendarDate: { kind: "today" } } as const, "day", "2026-08-25"],
      ["Yarınki programımı göster", { calendarView: "day", calendarDate: { kind: "tomorrow" } } as const, "day", "2026-08-26"],
      ["15 Eylül programımı göster", { calendarView: "day", calendarDate: { kind: "explicit", day: 15, month: 9 } } as const, "day", "2026-09-15"],
    ])("%s resolves to the correct canonical view and date", async (_utterance, refinement, expectedView, expectedDate) => {
      const result = await resolveBusinessNavigation({
        understanding: understanding({ operation: "NAVIGATE", domain: "calendar", target: "root", entityReference: null, ...refinement }),
        listCustomers: async () => customers,
        now,
      });
      expect(result.status).toBe("RESOLVED");
      if (result.status !== "RESOLVED") return;
      expect(projectBusinessNavigation(result.descriptor)).toMatchObject({ route: "/metrix/calendar", view: expectedView, focusDate: expectedDate });
      expect(projectBusinessNavigationOperationEvidence(result)).toEqual({ operation: "CALENDAR_OPEN", navigationProjected: true, view: expectedView, focusDate: expectedDate });
    });
    it.each([
      ["Bu haftayı göster", { calendarView: "week", calendarDate: null } as const, "week"],
      ["Bu ayı göster", { calendarView: "month", calendarDate: null } as const, "month"],
    ])("%s resolves to the correct canonical view with no forced date", async (_utterance, refinement, expectedView) => {
      const result = await resolveBusinessNavigation({
        understanding: understanding({ operation: "NAVIGATE", domain: "calendar", target: "root", entityReference: null, ...refinement }),
        listCustomers: async () => customers,
        now,
      });
      expect(result.status).toBe("RESOLVED");
      if (result.status !== "RESOLVED") return;
      const projected = projectBusinessNavigation(result.descriptor);
      expect(projected.route).toBe("/metrix/calendar");
      expect(projected.view).toBe(expectedView);
      expect(projected.focusDate).toBeUndefined();
    });
    it("an explicit date already passed this year rolls over to next year", async () => {
      const result = await resolveBusinessNavigation({
        understanding: understanding({ operation: "NAVIGATE", domain: "calendar", target: "root", entityReference: null, calendarView: "day", calendarDate: { kind: "explicit", day: 1, month: 1 } }),
        listCustomers: async () => customers,
        now,
      });
      expect(result.status).toBe("RESOLVED");
      if (result.status !== "RESOLVED") return;
      expect(projectBusinessNavigation(result.descriptor).focusDate).toBe("2027-01-01");
    });
    it("a plain 'open calendar' with no time context carries no view/date", async () => {
      const result = await resolveBusinessNavigation({
        understanding: understanding({ operation: "NAVIGATE", domain: "calendar", target: "root", entityReference: null }),
        listCustomers: async () => customers,
        now,
      });
      expect(result.status).toBe("RESOLVED");
      if (result.status !== "RESOLVED") return;
      const projected = projectBusinessNavigation(result.descriptor);
      expect(projected.view).toBeUndefined();
      expect(projected.focusDate).toBeUndefined();
    });
  });
});
