import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import { buildCompanySurfaceNavigationUnderstanding, recognizeCompanySurfaceNavigation } from "@/lib/conversation-understanding/company-surface-navigation";
import type { ActiveWorkspaceContext } from "@/lib/living-workspace";
import { buildCalendarNavigationMessage, createCalendarClock, projectBusinessNavigation, projectBusinessNavigationOperationEvidence, resolveBusinessNavigation, sampleRecordNamesForNarration, SPOKEN_LIST_NAME_SAMPLE_SIZE } from "../business-navigation";

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
    [{ operation: "NAVIGATE", domain: "performance", target: "root", entityReference: null } as const, "/metrix/performance"],
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

  describe("Calendar view/date authority — deterministic resolution from the authenticated user's timezone", () => {
    const timeZone = "Europe/Istanbul";
    const calendarClock = createCalendarClock(new Date("2026-08-24T22:30:00.000Z"), timeZone);
    it.each([
      ["Bugünkü programımı göster", { calendarView: "day", calendarDate: { kind: "today" } } as const, "day", "2026-08-25"],
      ["Yarınki programımı göster", { calendarView: "day", calendarDate: { kind: "tomorrow" } } as const, "day", "2026-08-26"],
      ["15 Eylül programımı göster", { calendarView: "day", calendarDate: { kind: "explicit", day: 15, month: 9 } } as const, "day", "2026-09-15"],
    ])("%s resolves to the correct canonical view and date", async (_utterance, refinement, expectedView, expectedDate) => {
      const result = await resolveBusinessNavigation({
        understanding: understanding({ operation: "NAVIGATE", domain: "calendar", target: "root", entityReference: null, ...refinement }),
        listCustomers: async () => customers,
        calendarClock,
      });
      expect(result.status).toBe("RESOLVED");
      if (result.status !== "RESOLVED") return;
      expect(projectBusinessNavigation(result.descriptor)).toMatchObject({ route: "/metrix/calendar", view: expectedView, focusDate: expectedDate });
      expect(projectBusinessNavigationOperationEvidence(result)).toEqual({ operation: "CALENDAR_OPEN", navigationProjected: true, view: expectedView, focusDate: expectedDate });
    });
    it.each([
      [{ operation: "CALENDAR_OPEN", navigationProjected: true, view: "day", focusDate: "2026-08-25" } as const, "Bugünün programını takvimde açtım."],
      [{ operation: "CALENDAR_OPEN", navigationProjected: true, view: "day", focusDate: "2026-08-26" } as const, "Yarının programını takvimde açtım."],
      [{ operation: "CALENDAR_OPEN", navigationProjected: true, view: "week", focusDate: "2026-08-25" } as const, "Takvimi haftalık görünümde açtım."],
      [{ operation: "CALENDAR_OPEN", navigationProjected: true, view: "month", focusDate: "2026-08-25" } as const, "Takvimi aylık görünümde açtım."],
      [{ operation: "CALENDAR_OPEN", navigationProjected: true, view: "day", focusDate: "2026-09-15" } as const, "15 Eylül gününün programını takvimde açtım."],
    ])("narrates the resolved Calendar view/date without reinterpreting the anchor", (evidence, expected) => {
      expect(buildCalendarNavigationMessage(evidence, calendarClock)).toBe(expected);
    });
    it.each([
      ["Bu haftayı göster", { calendarView: "week", calendarDate: null } as const, "week"],
      ["Bu ayı göster", { calendarView: "month", calendarDate: null } as const, "month"],
    ])("%s resolves to the correct canonical view containing local today", async (_utterance, refinement, expectedView) => {
      const result = await resolveBusinessNavigation({
        understanding: understanding({ operation: "NAVIGATE", domain: "calendar", target: "root", entityReference: null, ...refinement }),
        listCustomers: async () => customers,
        calendarClock,
      });
      expect(result.status).toBe("RESOLVED");
      if (result.status !== "RESOLVED") return;
      const projected = projectBusinessNavigation(result.descriptor);
      expect(projected.route).toBe("/metrix/calendar");
      expect(projected.view).toBe(expectedView);
      expect(projected.focusDate).toBe("2026-08-25");
    });
    it("uses the canonical local year for explicit-date inference", async () => {
      const result = await resolveBusinessNavigation({
        understanding: understanding({ operation: "NAVIGATE", domain: "calendar", target: "root", entityReference: null, calendarView: "day", calendarDate: { kind: "explicit", day: 1, month: 1 } }),
        listCustomers: async () => customers,
        calendarClock,
      });
      expect(result.status).toBe("RESOLVED");
      if (result.status !== "RESOLVED") return;
      expect(projectBusinessNavigation(result.descriptor).focusDate).toBe("2027-01-01");
    });
    it("crosses 31 December UTC into 1 January in the canonical timezone", () => {
      expect(createCalendarClock(new Date("2026-12-31T22:30:00.000Z"), timeZone)).toMatchObject({
        today: "2027-01-01",
        tomorrow: "2027-01-02",
      });
    });
    it.each([
      [{ kind: "explicit", day: 1, month: 1 } as const, "2027-01-01"],
      [{ kind: "explicit", day: 31, month: 12 } as const, "2027-12-31"],
    ])("infers explicit dates around New Year from the canonical local date", async (calendarDate, expected) => {
      const result = await resolveBusinessNavigation({
        understanding: understanding({ operation: "NAVIGATE", domain: "calendar", target: "root", entityReference: null, calendarView: "day", calendarDate }),
        listCustomers: async () => customers,
        calendarClock: createCalendarClock(new Date("2026-12-31T22:30:00.000Z"), timeZone),
      });
      expect(result.status).toBe("RESOLVED");
      if (result.status === "RESOLVED") expect(projectBusinessNavigation(result.descriptor).focusDate).toBe(expected);
    });
    it.each([
      ["week", "2026-08-30T22:30:00.000Z", "2026-08-31"],
      ["month", "2026-08-31T22:30:00.000Z", "2026-09-01"],
    ] as const)("anchors the current %s to canonical today across its UTC boundary", async (calendarView, instant, expected) => {
      const result = await resolveBusinessNavigation({
        understanding: understanding({ operation: "NAVIGATE", domain: "calendar", target: "root", entityReference: null, calendarView, calendarDate: null }),
        listCustomers: async () => customers,
        calendarClock: createCalendarClock(new Date(instant), timeZone),
      });
      expect(result.status).toBe("RESOLVED");
      if (result.status === "RESOLVED") expect(projectBusinessNavigation(result.descriptor).focusDate).toBe(expected);
    });
    it("a plain 'open calendar' with no time context carries no view/date", async () => {
      const result = await resolveBusinessNavigation({
        understanding: understanding({ operation: "NAVIGATE", domain: "calendar", target: "root", entityReference: null }),
        listCustomers: async () => customers,
        calendarClock,
      });
      expect(result.status).toBe("RESOLVED");
      if (result.status !== "RESOLVED") return;
      const projected = projectBusinessNavigation(result.descriptor);
      expect(projected.view).toBeUndefined();
      expect(projected.focusDate).toBeUndefined();
    });
  });

  // Integrations Workspace Reachability Fix: "Şirketimin entegrasyonlarını
  // aç." style phrases resolve through the SAME company.root target Şirketim
  // already uses (see business-navigation.ts's CompanySectionRequest) — no
  // second domain/target, no phrase-specific patch. These fixtures represent
  // the structured output the classifier is expected to produce for exactly
  // the phrases the operation asked for (A/B/C below); the classification
  // itself is an LLM call this suite does not exercise, matching the same
  // testing boundary the Calendar view/date fixtures above already use.
  describe("Company section authority — reachable integrations surface", () => {
    it.each([
      ["A) Şirketimin entegrasyonlarını aç.", "integrations"],
      ["B) Entegrasyonları aç.", "integrations"],
      ["C) iCloud takvimimi bağlamak istiyorum.", "integrations"],
    ] as const)("%s resolves to company.root with section=integrations, same canonical surface", async (_phrase, section) => {
      const result = await resolveBusinessNavigation({
        understanding: understanding({ operation: "NAVIGATE", domain: "company", target: "root", entityReference: null, companySection: section }),
        listCustomers: async () => customers,
      });
      expect(result.status).toBe("RESOLVED");
      if (result.status !== "RESOLVED") return;
      expect(result.descriptor).toEqual({ domain: "company", kind: "company.root", section: "integrations" });
      const projected = projectBusinessNavigation(result.descriptor);
      // Same route/authority key as a plain "Şirketimi aç" — no second
      // navigation system, no separate integrations route.
      expect(projected.route).toBe("/metrix/company");
      expect(projected.expectedSurfaceAuthorityKey).toBe("company.operating.page");
      expect(projected.section).toBe("integrations");
    });

    it("a plain company-profile request carries no section — defaults to the surface's own default tab", async () => {
      const result = await resolveBusinessNavigation({
        understanding: understanding({ operation: "NAVIGATE", domain: "company", target: "root", entityReference: null, companySection: null }),
        listCustomers: async () => customers,
      });
      expect(result.status).toBe("RESOLVED");
      if (result.status !== "RESOLVED") return;
      expect(result.descriptor).toEqual({ domain: "company", kind: "company.root" });
      expect(projectBusinessNavigation(result.descriptor).section).toBeUndefined();
    });

    // Company Integrations Navigation Determinism Fix — the exact live
    // production phrase, run through the REAL deterministic recognizer
    // (company-surface-navigation.ts), not a hand-built fixture: this is
    // what actually broke in production (commit 705a9d5's LLM-few-shot-only
    // fix did not survive the real model call for this phrase). Proves the
    // full deterministic chain — recognizer -> understanding -> resolver ->
    // projector — reaches "/metrix/company" + section "integrations" with
    // zero LLM involvement.
    it("EXACT LIVE PHRASE: 'Şirketimin entegrasyonlarını aç.' resolves end-to-end through the real deterministic recognizer, no LLM involved", async () => {
      const match = recognizeCompanySurfaceNavigation("Şirketimin entegrasyonlarını aç.");
      expect(match).toEqual({ companySection: "integrations" });
      if (!match) return;
      const result = await resolveBusinessNavigation({ understanding: buildCompanySurfaceNavigationUnderstanding(match), listCustomers: async () => customers });
      expect(result.status).toBe("RESOLVED");
      if (result.status !== "RESOLVED") return;
      expect(result.descriptor).toEqual({ domain: "company", kind: "company.root", section: "integrations" });
      const projected = projectBusinessNavigation(result.descriptor);
      expect(projected).toEqual({ route: "/metrix/company", expectedSurfaceAuthorityKey: "company.operating.page", section: "integrations" });
    });

    it("EXACT LIVE PHRASE: 'iCloud takvimimi bağlamak istiyorum.' resolves to the same Company surface, not Calendar", async () => {
      const match = recognizeCompanySurfaceNavigation("iCloud takvimimi bağlamak istiyorum.");
      expect(match).toEqual({ companySection: "integrations" });
      if (!match) return;
      const result = await resolveBusinessNavigation({ understanding: buildCompanySurfaceNavigationUnderstanding(match), listCustomers: async () => customers });
      expect(result.status).toBe("RESOLVED");
      if (result.status !== "RESOLVED") return;
      expect(projectBusinessNavigation(result.descriptor).route).toBe("/metrix/company");
    });

    it("NEGATIVE: an advisory integrations question never produces a navigation descriptor at all — recognizer returns null, resolver never runs", () => {
      expect(recognizeCompanySurfaceNavigation("Şirketimde hangi entegrasyonları kullanmalıyım?")).toBeNull();
    });
  });

  // Navigation Truth Consistency fix. This is the real route ownership seam
  // (business-navigation.ts's own projectBusinessNavigationOperationEvidence,
  // the exact function route.ts calls to decide what Executive Brain is told
  // about a resolved navigation), not just the recognizer: live evidence was
  // "Şirketimin entegrasyonlarını aç." correctly opening the Company/
  // Integrations Workspace while METRIX simultaneously narrated as though no
  // navigation had happened at all, because company.root produced no
  // operation evidence whatsoever — Executive Brain had zero signal a
  // navigation was ever resolved this turn. Company/integrations here PLUS
  // an unrelated existing domain (accounting.root) proves this is a
  // horizontal, system-wide fallback, not a company-specific patch.
  describe("NAVIGATION_RESOLVED — system-wide fallback evidence for every RESOLVED kind with no dedicated evidence variant", () => {
    it("EXACT LIVE PHRASE: company.root + section integrations produces evidence carrying the real resolved section, not a generic 'no info' signal", async () => {
      const match = recognizeCompanySurfaceNavigation("Şirketimin entegrasyonlarını aç.");
      expect(match).toEqual({ companySection: "integrations" });
      if (!match) return;
      const result = await resolveBusinessNavigation({ understanding: buildCompanySurfaceNavigationUnderstanding(match), listCustomers: async () => customers });
      expect(result.status).toBe("RESOLVED");
      const evidence = projectBusinessNavigationOperationEvidence(result);
      expect(evidence).toEqual({ operation: "NAVIGATION_RESOLVED", domain: "company", kind: "company.root", section: "integrations" });
    });

    it("a plain company.root request (no section) produces evidence with no section field — never claims a specific area was opened when it wasn't", async () => {
      const result = await resolveBusinessNavigation({ understanding: understanding({ operation: "NAVIGATE", domain: "company", target: "root", entityReference: null, companySection: null }), listCustomers: async () => customers });
      expect(result.status).toBe("RESOLVED");
      expect(projectBusinessNavigationOperationEvidence(result)).toEqual({ operation: "NAVIGATION_RESOLVED", domain: "company", kind: "company.root" });
    });

    it("CROSS-DOMAIN (horizontal proof): accounting.root — a domain that never carries a company-specific concept — gets the same fallback evidence", async () => {
      const result = await resolveBusinessNavigation({ understanding: understanding({ operation: "NAVIGATE", domain: "accounting", target: "root", entityReference: null }), listCustomers: async () => customers });
      expect(result.status).toBe("RESOLVED");
      expect(projectBusinessNavigationOperationEvidence(result)).toEqual({ operation: "NAVIGATION_RESOLVED", domain: "accounting", kind: "accounting.root" });
    });

    it("does not shadow a domain that already has its own specific evidence variant (Calendar keeps CALENDAR_OPEN, not the generic fallback)", async () => {
      const result = await resolveBusinessNavigation({ understanding: understanding({ operation: "NAVIGATE", domain: "calendar", target: "root", entityReference: null }), listCustomers: async () => customers });
      expect(result.status).toBe("RESOLVED");
      const evidence = projectBusinessNavigationOperationEvidence(result);
      expect(evidence?.operation).toBe("CALENDAR_OPEN");
    });

    it("does not shadow customer detail lookup either (still CUSTOMER_LOOKUP, unaffected)", async () => {
      const result = await resolveBusinessNavigation({ understanding: understanding({ operation: "NAVIGATE", domain: "customer", target: "detail", entityReference: "Atlas" }), listCustomers: async () => customers });
      expect(result.status).toBe("RESOLVED");
      const evidence = projectBusinessNavigationOperationEvidence(result);
      expect(evidence?.operation).toBe("CUSTOMER_LOOKUP");
    });

    it("F) never fires for an unresolved/clarification-needed turn — clarification is not globally suppressed", async () => {
      const result = await resolveBusinessNavigation({ understanding: understanding({ operation: "NAVIGATE", domain: "customer", target: "detail", entityReference: null }), listCustomers: async () => customers });
      expect(result.status).toBe("CLARIFICATION_REQUIRED");
      expect(projectBusinessNavigationOperationEvidence(result)?.operation).not.toBe("NAVIGATION_RESOLVED");
    });
  });
});

describe("generic DOMAIN_LIST grounding — stock/order/invoice/payment/supplier/product/task", () => {
  it.each([
    ["stock", "stock.list", "/metrix/stock"],
    ["order", "order.list", "/metrix/orders"],
    ["invoice", "invoice.list", "/metrix/invoices"],
    ["payment", "payment.list", "/metrix/collections"],
    ["supplier", "supplier.list", "/metrix/suppliers"],
    ["product", "products.list", "/metrix/products"],
    ["task", "task.list", "/metrix/tasks"],
  ] as const)("resolves domain \"%s\" target list to a real DOMAIN_LIST evidence and its own route", async (domain, kind, route) => {
    const snapshot = { recordCount: 42, recordNames: ["Kayıt A", "Kayıt B"] };
    const listDomainRecords = vi.fn(async () => snapshot);
    const result = await resolveBusinessNavigation({
      understanding: understanding({ operation: "NAVIGATE", domain, target: "list", entityReference: null }),
      listCustomers: async () => customers,
      listDomainRecords,
    });
    expect(result).toMatchObject({ status: "RESOLVED", descriptor: { domain, kind }, listSnapshot: snapshot });
    if (result.status !== "RESOLVED") return;
    expect(projectBusinessNavigation(result.descriptor).route).toBe(route);
    expect(projectBusinessNavigationOperationEvidence(result)).toEqual({
      operation: "DOMAIN_LIST",
      domain,
      canonicalRepositoryQueried: true,
      outcome: "RESOLVED",
      recordCount: 42,
      recordNames: ["Kayıt A", "Kayıt B"],
      navigationProjected: true,
    });
    expect(listDomainRecords).toHaveBeenCalledWith(domain);
  });

  it("falls back to generic NAVIGATION_RESOLVED evidence (not the DOMAIN_LIST-with-names shape, and never null) when the caller does not wire a snapshot fetcher", async () => {
    // Navigation Truth Consistency fix: this resolved navigation must still
    // reach narration even without record-name evidence — the exact same
    // class of bug company.root had (a RESOLVED descriptor silently
    // producing no evidence at all), now closed system-wide rather than
    // just for company/integrations.
    const result = await resolveBusinessNavigation({
      understanding: understanding({ operation: "NAVIGATE", domain: "stock", target: "list", entityReference: null }),
      listCustomers: async () => customers,
    });
    expect(result.status).toBe("RESOLVED");
    expect(projectBusinessNavigationOperationEvidence(result)).toEqual({ operation: "NAVIGATION_RESOLVED", domain: "stock", kind: "stock.list" });
  });

  it("never confuses a listable domain's non-list target with list grounding", async () => {
    const listDomainRecords = vi.fn(async () => ({ recordCount: 1, recordNames: ["X"] }));
    const result = await resolveBusinessNavigation({
      understanding: understanding({ operation: "NAVIGATE", domain: "stock", target: "detail", entityReference: "X" }),
      listCustomers: async () => customers,
      listDomainRecords,
    });
    expect(result).toEqual({ status: "UNAVAILABLE" });
    expect(listDomainRecords).not.toHaveBeenCalled();
  });
});

describe("sampleRecordNamesForNarration", () => {
  it("returns the full list untruncated when it fits within the sample size", () => {
    const names = ["Atlas", "Vega", "Orion"];
    expect(sampleRecordNamesForNarration(names)).toEqual({ sample: names, remainingCount: 0 });
  });

  it("caps a large list to the sample size and reports how many were left out — this is what stops a voice answer from reading out every one of 100+ names", () => {
    const names = Array.from({ length: 120 }, (_, i) => `Müşteri ${i + 1}`);
    const result = sampleRecordNamesForNarration(names);
    expect(result.sample).toHaveLength(SPOKEN_LIST_NAME_SAMPLE_SIZE);
    expect(result.sample).toEqual(names.slice(0, SPOKEN_LIST_NAME_SAMPLE_SIZE));
    expect(result.remainingCount).toBe(120 - SPOKEN_LIST_NAME_SAMPLE_SIZE);
  });

  it("accepts a custom sample size for callers with a different narration budget", () => {
    const names = ["A", "B", "C", "D", "E"];
    expect(sampleRecordNamesForNarration(names, 2)).toEqual({ sample: ["A", "B"], remainingCount: 3 });
  });

  it("never reports a negative remainingCount for an empty list", () => {
    expect(sampleRecordNamesForNarration([])).toEqual({ sample: [], remainingCount: 0 });
  });
});
