import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import { projectBusinessNavigation, projectBusinessNavigationOperationEvidence, resolveBusinessNavigation } from "../business-navigation";

const understanding = (businessNavigation: NonNullable<ConversationUnderstanding["businessNavigation"]>, sourceConfidence: "high" | "medium" | "low" = "high"): ConversationUnderstanding => ({
  conversationKind: "company_related", userMotivation: "bilgi_almak", companyRelevance: "high", actionExpectation: "explicit", confidence: sourceConfidence,
  shouldAskClarification: false, shouldInvokeExecutiveBrain: true, suggestedHandling: "executive_reasoning", businessNavigation,
  reasoning: { summary: "Canonical fixture", observations: [], uncertainty: [], whyThisHandling: "Already resolved upstream." },
});
const customers = [{ id: "atlas-1", displayName: "Atlas", legalName: null, phone: null, email: null, cariKodu: null, taxNumber: null }];

describe("typed business navigation resolution", () => {
  it.each([
    [{ operation: "NAVIGATE", domain: "company", target: "root", entityReference: null } as const, "/metrix/company"],
    [{ operation: "NAVIGATE", domain: "customer", target: "list", entityReference: null } as const, "/metrix/customers"],
    [{ operation: "NAVIGATE", domain: "customer", target: "create", entityReference: null } as const, "/metrix/customers/new"],
    [{ operation: "NAVIGATE", domain: "offer", target: "list", entityReference: null } as const, "/metrix/offers"],
    [{ operation: "NAVIGATE", domain: "product", target: "list", entityReference: null } as const, "/metrix/products"],
    [{ operation: "NAVIGATE", domain: "task", target: "create", entityReference: null } as const, "/metrix/tasks/new"],
    [{ operation: "NAVIGATE", domain: "accounting", target: "root", entityReference: null } as const, "/metrix/accounting"],
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
});
